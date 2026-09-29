import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'
import { current } from 'immer'
import { seedAudit, seedBatches, seedDeviations, seedDraftReason, seedDraftSteps, seedMatrixVersions } from '../data/seed'
import { diffSteps, formatChange, latestVersion } from '../services/matrix'
import type { AuditEntry, Batch, BatchStatus, Deviation, DeviationStatus, Investigation, MatrixVersion, ProcessStep } from '../types'

interface HaccpState {
  batches: Batch[]
  deviations: Deviation[]
  /** 已发布的控制矩阵版本，按版本号排列，全部只读 */
  matrixVersions: MatrixVersion[]
  /** 草稿工作副本：编辑只停留在此处，不影响已开工批次 */
  draftSteps: ProcessStep[]
  draftReason: string
  audit: AuditEntry[]
  batchFilter: string
  batchStatus: BatchStatus | '全部'
  selectedBatchId: string | null
}

interface PersistedState extends HaccpState {}
const STORAGE_KEY = 'gsb64:haccp-platform-v2'

function seedState(): HaccpState {
  return {
    batches: seedBatches,
    deviations: seedDeviations,
    matrixVersions: seedMatrixVersions,
    draftSteps: seedDraftSteps,
    draftReason: seedDraftReason,
    audit: seedAudit,
    batchFilter: '',
    batchStatus: '全部',
    selectedBatchId: seedBatches[0].id
  }
}

function initialState(): HaccpState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as HaccpState
      // 仅接受含版本矩阵结构的存档，避免旧版数据导致引用错乱。
      if (Array.isArray(parsed.matrixVersions) && Array.isArray(parsed.draftSteps)) return parsed
    }
  } catch {
    // Seed data remains available when local storage is unavailable or corrupt.
  }
  return seedState()
}

const slice = createSlice({
  name: 'haccp',
  initialState,
  reducers: {
    setBatchFilter(state, action: PayloadAction<string>) { state.batchFilter = action.payload },
    setBatchStatus(state, action: PayloadAction<BatchStatus | '全部'>) { state.batchStatus = action.payload },
    setSelectedBatch(state, action: PayloadAction<string | null>) { state.selectedBatchId = action.payload },

    /** 编辑草稿：只改写草稿副本，已发布版本与在产批次参数不变。 */
    updateDraftStep(state, action: PayloadAction<ProcessStep>) {
      const index = state.draftSteps.findIndex((item) => item.id === action.payload.id)
      if (index >= 0) state.draftSteps[index] = action.payload
    },
    setDraftReason(state, action: PayloadAction<string>) { state.draftReason = action.payload },
    discardDraft(state) {
      state.draftSteps = structuredClone(current(latestVersion(state.matrixVersions).steps))
      state.draftReason = ''
      log(state, '控制矩阵草稿', '放弃草稿', '当前用户', '草稿修改已丢弃，恢复为当前已发布版本')
    },
    /** 发布草稿：生成只读新版本；此后新开工批次才采用新版本，旧批次继续指向开工版本。 */
    publishDraft(state, action: PayloadAction<{ reason: string; publishedBy: string }>) {
      const base = latestVersion(state.matrixVersions)
      const changes = diffSteps(base.steps, state.draftSteps)
      const reason = action.payload.reason.trim()
      if (changes.length === 0 || !reason) return
      const now = new Date().toISOString()
      const version: MatrixVersion = {
        version: base.version + 1,
        publishedAt: now,
        publishedBy: action.payload.publishedBy,
        reason,
        basedOnVersion: base.version,
        steps: structuredClone(current(state.draftSteps))
      }
      state.matrixVersions.push(version)
      for (const change of changes) {
        log(state, `控制矩阵 V${version.version}`, '关键限值变更', action.payload.publishedBy, formatChange(change), now)
      }
      log(
        state,
        `控制矩阵 V${version.version}`,
        '发布控制矩阵',
        action.payload.publishedBy,
        `基于V${base.version}发布V${version.version}，共${changes.length}处变更。变更原因：${reason}。新开工批次采用本版，已开工批次及相关偏差仍锁定V${base.version}及更早版本。`,
        now
      )
      state.draftReason = ''
    },

    /** 开工建档：批次锁定当前已发布矩阵版本。 */
    startBatch(state, action: PayloadAction<{ product: string; line: string; quantity: number }>) {
      const current = latestVersion(state.matrixVersions)
      const seq = String(state.batches.length + 1).padStart(2, '0')
      const now = new Date()
      const id = `B${now.toISOString().slice(0, 10).replace(/-/g, '').slice(2)}-${seq}`
      const batch: Batch = {
        id,
        product: action.payload.product,
        line: action.payload.line,
        quantity: action.payload.quantity,
        producedAt: now.toISOString(),
        status: '生产中',
        isolationScope: '无',
        monitoring: [],
        version: 1,
        matrixVersion: current.version
      }
      state.batches.unshift(batch)
      state.selectedBatchId = batch.id
      log(state, batch.id, '开工建档', '当前用户', `按控制矩阵V${current.version}开工，限值参数已锁定到本批次`)
    },

    updateBatchStatus(state, action: PayloadAction<{ id: string; status: BatchStatus }>) {
      const batch = state.batches.find((item) => item.id === action.payload.id)
      if (!batch) return
      const blocking = state.deviations.some((item) => item.batchId === batch.id && item.status !== '已关闭')
      if (action.payload.status === '可放行' && blocking) return
      batch.status = action.payload.status
      batch.version += 1
      log(state, batch.id, '批次状态流转', '质量主管', `状态更新为${action.payload.status}（开工版本V${batch.matrixVersion}不变）`)
    },
    createDeviation(state, action: PayloadAction<{ batchId: string; stepId: string; title: string; severity: '一般' | '重大'; owner: string }>) {
      const batch = state.batches.find((item) => item.id === action.payload.batchId)
      if (!batch) return
      const now = new Date().toISOString()
      const deviation: Deviation = {
        id: `DEV-${Date.now().toString().slice(-8)}`, ...action.payload, status: '待调查', openedAt: now,
        dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), reviewNote: '', reviewer: '', version: 1,
        matrixVersion: batch.matrixVersion,
        investigation: { cause: '', evidence: '', decision: '返工', reworkInstruction: '' }
      }
      state.deviations.unshift(deviation)
      batch.status = '隔离中'
      batch.version += 1
      log(state, deviation.id, '创建偏差调查', '当前用户', `批次${batch.id}因${action.payload.title}进入隔离，判定依据锁定开工版本V${batch.matrixVersion}`)
    },
    saveInvestigation(state, action: PayloadAction<{ id: string; investigation: Investigation }>) {
      const deviation = state.deviations.find((item) => item.id === action.payload.id)
      if (!deviation || !action.payload.investigation.cause.trim() || !action.payload.investigation.evidence.trim()) return
      deviation.investigation = action.payload.investigation
      deviation.status = '待复核'
      deviation.version += 1
      log(state, deviation.id, '提交偏差调查', deviation.owner, `处置分支：${deviation.investigation.decision}（开工版本V${deviation.matrixVersion}）`)
    },
    reviewDeviation(state, action: PayloadAction<{ id: string; approved: boolean; note: string; reviewer: string }>) {
      const deviation = state.deviations.find((item) => item.id === action.payload.id)
      if (!deviation) return
      if (action.payload.approved && !action.payload.note.trim()) return
      deviation.reviewNote = action.payload.note
      deviation.reviewer = action.payload.reviewer
      deviation.status = action.payload.approved ? '已关闭' : '调查中'
      deviation.version += 1
      const batch = state.batches.find((item) => item.id === deviation.batchId)
      if (batch && action.payload.approved && !state.deviations.some((item) => item.batchId === batch.id && item.status !== '已关闭' && item.id !== deviation.id)) {
        batch.status = deviation.investigation.decision === '报废' ? '已报废' : '待复核'
        batch.version += 1
      }
      log(state, deviation.id, action.payload.approved ? '复核通过' : '退回补证', action.payload.reviewer, `${action.payload.note || '退回调查'}（开工版本V${deviation.matrixVersion}）`)
    },
    resetDemo() {
      return seedState()
    }
  }
})

function log(state: HaccpState, entity: string, action: string, operator: string, detail: string, createdAt = new Date().toISOString()) {
  state.audit.unshift({ id: nanoid(), entity, action, operator, detail, createdAt })
}

export const {
  setBatchFilter,
  setBatchStatus,
  setSelectedBatch,
  updateDraftStep,
  setDraftReason,
  discardDraft,
  publishDraft,
  startBatch,
  updateBatchStatus,
  createDeviation,
  saveInvestigation,
  reviewDeviation,
  resetDemo
} = slice.actions
export type { PersistedState }
export default slice.reducer
