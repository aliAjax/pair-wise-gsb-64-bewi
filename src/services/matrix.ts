import type { MatrixFieldChange, MatrixStepField, MatrixVersion, ProcessStep } from '../types'

export const MATRIX_FIELD_LABELS: Record<MatrixStepField, string> = {
  limit: '关键限值',
  frequency: '监控频率',
  correctiveAction: '纠偏措施'
}

export const MATRIX_STEP_FIELDS: MatrixStepField[] = ['limit', 'frequency', 'correctiveAction']

export function latestVersion(versions: MatrixVersion[]): MatrixVersion {
  return versions.reduce((acc, item) => (item.version > acc.version ? item : acc), versions[0])
}

export function findVersion(versions: MatrixVersion[], version: number): MatrixVersion | undefined {
  return versions.find((item) => item.version === version)
}

/** 找到批次/偏差开工版本对应步骤；若历史版本缺失则回退到最近一版。 */
export function pinStep(versions: MatrixVersion[], matrixVersion: number, stepId: string): ProcessStep | undefined {
  const matrix = findVersion(versions, matrixVersion) ?? latestVersion(versions)
  return matrix?.steps.find((step) => step.id === stepId)
}

/** 比对两个快照，列出关键限值等字段的变更前后值。 */
export function diffSteps(base: ProcessStep[], next: ProcessStep[]): MatrixFieldChange[] {
  const changes: MatrixFieldChange[] = []
  for (const step of next) {
    const old = base.find((item) => item.id === step.id)
    if (!old) continue
    for (const field of MATRIX_STEP_FIELDS) {
      if (old[field] !== step[field]) {
        changes.push({ stepId: step.id, stepName: step.name, field, before: old[field], after: step[field] })
      }
    }
  }
  return changes
}

export function formatChange(change: MatrixFieldChange): string {
  return `${change.stepName}${MATRIX_FIELD_LABELS[change.field]}：${change.before} → ${change.after}`
}
