import type { Batch, MatrixDraft, MatrixVersion, ProcessStep, StepParameters, StepSnapshot } from '../types'

/** 当前对新批次生效的已发布版本（每个控制点的最高版本号） */
export function latestPublished(versions: MatrixVersion[], stepId: string): MatrixVersion | undefined {
  return versions.filter((item) => item.stepId === stepId).reduce<MatrixVersion | undefined>(
    (best, item) => (!best || item.version > best.version ? item : best),
    undefined
  )
}

export function publishedVersion(versions: MatrixVersion[], stepId: string, version: number): MatrixVersion | undefined {
  return versions.find((item) => item.stepId === stepId && item.version === version)
}

export function versionsOf(versions: MatrixVersion[], stepId: string): MatrixVersion[] {
  return versions
    .filter((item) => item.stepId === stepId)
    .sort((a, b) => b.version - a.version)
}

/** 已发布限值（无版本记录时返回空串），供监控值判定等场景使用 */
export function publishedLimit(versions: MatrixVersion[], stepId: string): string {
  return latestPublished(versions, stepId)?.limit ?? ''
}

/** 批次开工时某控制点的固化快照 */
export function snapshotAt(batch: Batch, stepId: string): StepSnapshot | undefined {
  return batch.stepSnapshots.find((item) => item.stepId === stepId)
}

/** 批次当时执行的关键限值（开工版本，只读） */
export function limitAtBatch(batch: Batch, stepId: string): string {
  return snapshotAt(batch, stepId)?.limit ?? '—'
}

/** 合并控制点基础信息与某版参数，供表格展示 */
export function stepRow(step: ProcessStep, parameters: StepParameters) {
  return { ...step, ...parameters }
}

/** 草稿与某版本（默认最新已发布）之间是否存在参数差异 */
export function draftDiffers(draft: MatrixDraft | undefined, versions: MatrixVersion[], stepId: string): boolean {
  if (!draft) return false
  const base = latestPublished(versions, stepId)
  if (!base) return true
  return draft.limit !== base.limit || draft.frequency !== base.frequency || draft.correctiveAction !== base.correctiveAction
}

export function hasDraftChange(draft: MatrixDraft | undefined, versions: MatrixVersion[], stepId: string): boolean {
  return draftDiffers(draft, versions, stepId)
}

/** 对比两版参数，返回发生变更的字段名（用于详情展示“变更前后的限值”） */
export function diffParameters(before: StepParameters, after: StepParameters): Array<keyof StepParameters> {
  return (['limit', 'frequency', 'correctiveAction'] as const).filter((key) => before[key] !== after[key])
}

/** 基于最新已发布版本为某控制点生成新批次的开工快照 */
export function snapshotFromPublished(
  step: ProcessStep,
  versions: MatrixVersion[]
): StepSnapshot | undefined {
  const current = latestPublished(versions, step.id)
  if (!current) return undefined
  return {
    stepId: step.id,
    version: current.version,
    controlPoint: step.controlPoint,
    limit: current.limit,
    frequency: current.frequency,
    correctiveAction: current.correctiveAction
  }
}

/** 简单的关键限值判定，用于在开工版本限值下提示监控值是否越限 */
export function violatesLimit(value: number, unit: string, limit: string): boolean {
  const match = /(-?\d+(?:\.\d+)?)/.exec(limit)
  if (!match) return false
  const target = Number(match[1])
  if (limit.includes('≤') || limit.includes('<=') || limit.includes('低于')) return value > target + 1e-9
  if (limit.includes('≥') || limit.includes('>=') || limit.includes('高于')) return value < target - 1e-9
  const range = limit.match(/(-?\d+(?:\.\d+)?)\s*[-–~]\s*(-?\d+(?:\.\d+)?)/)
  if (range) return value < Number(range[1]) - 1e-9 || value > Number(range[2]) + 1e-9
  return false
}
