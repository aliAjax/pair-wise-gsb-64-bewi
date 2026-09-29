import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'
import { seedAudit, seedBatches, seedDeviations, seedMatrixVersions, processSteps } from '../data/seed'
import { latestPublished, snapshotAt, snapshotFromPublished } from '../services/matrix'
import type { AuditEntry, Batch, BatchStatus, Deviation, DeviationStatus, Investigation, MatrixDraft, MatrixVersion, ProcessStep, StepParameters } from '../types'

interface HaccpState {
  batches: Batch[]
  deviations: Deviation[]
  processSteps: ProcessStep[]
  /** 已发布控制矩阵版本（追加写、旧版只读） */
  matrixVersions: MatrixVersion[]
  /** 每个控制点至多一份未发布草稿 */
  matrixDrafts: Record<string, MatrixDraft>
  audit: AuditEntry[]
  batchFilter: string
  batchStatus: BatchStatus | '全部'
  selectedBatchId: string | null
}

interface PersistedState extends HaccpState {}
const STORAGE_KEY = 'gsb64:haccp-platform-v2'
const PUBLISHER = '质量主管'

function buildInitialData() {
  return {
    batches: structuredClone(seedBatches),
    deviations: structuredClone(seedDeviations),
    processSteps: structuredClone(processSteps),
    matrixVersions: structuredClone(seedMatrixVersions),
    matrixDrafts: {} as Record<string, MatrixDraft>,
    audit: structuredClone(seedAudit),
    batchFilter: '',
    batchStatus: '全部' as const,
    selectedBatchId: seedBatches[0].id
  }
}

function initialState(): HaccpState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HaccpState>
      // 旧版本地数据缺少版本链时不直接复用，避免把单值控制矩阵误当成已发布版本
      if (Array.isArray(parsed.matrixVersions) && Array.isArray(parsed.processSteps)) {
        return { ...buildInitialData(), ...parsed, matrixDrafts: parsed.matrixDrafts ?? {} }
      }
    }
  } catch {
    // Seed data remains available when local storage is unavailable or corrupt.
  }
  return buildInitialData()
}

function log(state: HaccpState, entry: Omit<AuditEntry, 'id' | 'createdAt'> & { createdAt?: string }) {
  state.audit.unshift({ id: nanoid(), createdAt: new Date().toISOString(), ...entry })
}

const slice = createSlice({
  name: 'haccp',
  initialState,
  reducers: {
    setBatchFilter(state, action: PayloadAction<string>) { state.batchFilter = action.payload },
    setBatchStatus(state, action: PayloadAction<BatchStatus | '全部'>) { state.batchStatus = action.payload },
    setSelectedBatch(state, action: PayloadAction<string | null>) { state.selectedBatchId = action.payload },

    /** 保存草稿：仅更新草稿区，不产生已发布版本，不影响任何批次 */
    saveMatrixDraft(state, action: PayloadAction<{ stepId: string; parameters: StepParameters }>) {
      const { stepId, parameters } = action.payload
      state.matrixDrafts[stepId] = { stepId, ...parameters, updatedAt: new Date().toISOString() }
    },
    discardMatrixDraft(state, action: PayloadAction<string>) {
      delete state.matrixDrafts[action.payload]
    },
    // 发布控制点新版本：
    // 必须填写变更原因；新版本基于该控制点当前最新已发布版本；
    // 只对发布之后开工的批次生效，已开工批次、偏差、审计继续指向各自开工版本。
    publishMatrixVersion(state, action: PayloadAction<{ stepId: string; parameters: StepParameters; changeReason: string; publishedBy?: string }>) {
      const { stepId, changeReason } = action.payload
      const parameters: StepParameters = {
        limit: action.payload.parameters.limit.trim(),
        frequency: action.payload.parameters.frequency.trim(),
        correctiveAction: action.payload.parameters.correctiveAction.trim()
      }
      const reason = changeReason.trim()
      if (!reason || !parameters.limit || !parameters.frequency || !parameters.correctiveAction) return
      const step = state.processSteps.find((item) => item.id === stepId)
      const base = latestPublished(state.matrixVersions, stepId)
      // 与上一版没有任何参数差异时不允许生成新版本
      if (base && base.limit === parameters.limit && base.frequency === parameters.frequency && base.correctiveAction === parameters.correctiveAction) return
      const next: MatrixVersion = {
        stepId,
        version: (base?.version ?? 0) + 1,
        basedOnVersion: base?.version ?? null,
        ...parameters,
        changeReason: reason,
        publishedBy: action.payload.publishedBy?.trim() || PUBLISHER,
        publishedAt: new Date().toISOString()
      }
      state.matrixVersions.push(next)
      delete state.matrixDrafts[stepId]
      const changes: string[] = []
      if (base && base.limit !== next.limit) changes.push(`关键限值 ${base.limit} → ${next.limit}`)
      if (base && base.frequency !== next.frequency) changes.push(`监控频率 ${base.frequency} → ${next.frequency}`)
      if (base && base.correctiveAction !== next.correctiveAction) changes.push(`纠偏措施 ${base.correctiveAction} → ${next.correctiveAction}`)
      const scope = step?.name ?? stepId
      log(state, {
        entity: stepId,
        action: '发布控制矩阵版本',
        operator: next.publishedBy,
        detail: `${stepId} ${scope} V${next.basedOnVersion ?? 0}→V${next.version}（基于V${next.basedOnVersion ?? '—'}）：${changes.length ? changes.join('；') : '内容无变化'}。变更原因：${reason}。已开工批次仍按开工版本执行，新批次自本版起生效`,
        stepId,
        stepVersion: next.version
      })
    },

    /** 开工新批次：固化当前已发布矩阵为开工快照 */
    startBatch(state, action: PayloadAction<{ product: string; line: string; quantity: number }>) {
      const { product, line, quantity } = action.payload
      if (!product.trim()) return
      const now = new Date()
      const stamp = now.toISOString().slice(2, 10).replace(/-/g, '')
      const id = `B${stamp}-${nanoid(4).toUpperCase()}`
      const stepSnapshots = state.processSteps
        .map((step) => snapshotFromPublished(step, state.matrixVersions))
        .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot))
      const batch: Batch = {
        id, product: product.trim(), line: line.trim() || 'L1', quantity,
        producedAt: now.toISOString(), status: '生产中', isolationScope: '无', monitoring: [],
        version: 1, stepSnapshots
      }
      state.batches.unshift(batch)
      state.selectedBatchId = batch.id
      const versionSummary = stepSnapshots.map((snapshot) => `${snapshot.stepId}@V${snapshot.version}`).join('，')
      log(state, {
        entity: id,
        action: '批次开工',
        operator: PUBLISHER,
        detail: `${id}（${product}）开工，按当前已发布控制矩阵固化开工版本：${versionSummary}；后续矩阵发布不影响本批次`
      })
    },
    updateBatchStatus(state, action: PayloadAction<{ id: string; status: BatchStatus }>) {
      const batch = state.batches.find((item) => item.id === action.payload.id)
      if (!batch) return
      const blocking = state.deviations.some((item) => item.batchId === batch.id && item.status !== '已关闭')
      if (action.payload.status === '可放行' && blocking) return
      batch.status = action.payload.status
      batch.version += 1
      log(state, { entity: batch.id, action: '批次状态流转', operator: PUBLISHER, detail: `状态更新为${action.payload.status}（开工矩阵版本不变）` })
    },
    createDeviation(state, action: PayloadAction<{ batchId: string; stepId: string; title: string; severity: '一般' | '重大'; owner: string }>) {
      const batch = state.batches.find((item) => item.id === action.payload.batchId)
      if (!batch) return
      const now = new Date().toISOString()
      // 偏差锚定批次开工时该控制点的版本，而非矩阵当前最新版本
      const pinned = snapshotAt(batch, action.payload.stepId)
      const deviation: Deviation = {
        id: `DEV-${Date.now().toString().slice(-8)}`, ...action.payload, status: '待调查', openedAt: now,
        dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), reviewNote: '', reviewer: '', version: 1,
        stepVersion: pinned?.version ?? 0,
        investigation: { cause: '', evidence: '', decision: '返工', reworkInstruction: '' }
      }
      state.deviations.unshift(deviation)
      batch.status = '隔离中'
      batch.version += 1
      log(state, {
        entity: deviation.id,
        action: '创建偏差调查',
        operator: '当前用户',
        detail: `批次${batch.id}因${action.payload.title}进入隔离，判定依据为控制点${action.payload.stepId}开工版本V${deviation.stepVersion}（限值${pinned?.limit ?? '未知'}）`,
        stepId: action.payload.stepId,
        stepVersion: deviation.stepVersion
      })
    },
    saveInvestigation(state, action: PayloadAction<{ id: string; investigation: Investigation }>) {
      const deviation = state.deviations.find((item) => item.id === action.payload.id)
      if (!deviation || !action.payload.investigation.cause.trim() || !action.payload.investigation.evidence.trim()) return
      deviation.investigation = action.payload.investigation
      deviation.status = '待复核'
      deviation.version += 1
      log(state, {
        entity: deviation.id,
        action: '提交偏差调查',
        operator: deviation.owner,
        detail: `处置分支：${deviation.investigation.decision}（控制点${deviation.stepId} V${deviation.stepVersion}）`,
        stepId: deviation.stepId,
        stepVersion: deviation.stepVersion
      })
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
      log(state, {
        entity: deviation.id,
        action: action.payload.approved ? '复核通过' : '退回补证',
        operator: action.payload.reviewer,
        detail: `${action.payload.note || '退回调查'}（控制点${deviation.stepId}开工版本V${deviation.stepVersion}保持不变）`,
        stepId: deviation.stepId,
        stepVersion: deviation.stepVersion
      })
    },
    resetDemo() {
      return buildInitialData()
    }
  }
})

export const {
  setBatchFilter, setBatchStatus, setSelectedBatch,
  saveMatrixDraft, discardMatrixDraft, publishMatrixVersion,
  startBatch, updateBatchStatus,
  createDeviation, saveInvestigation, reviewDeviation,
  resetDemo
} = slice.actions
export type { PersistedState }
export default slice.reducer
