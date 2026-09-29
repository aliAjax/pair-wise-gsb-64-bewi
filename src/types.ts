export type BatchStatus = '生产中' | '待复核' | '可放行' | '隔离中' | '已放行' | '已报废'
export type DeviationStatus = '待调查' | '调查中' | '待复核' | '已关闭'
export type DecisionType = '返工' | '报废' | '让步接收'

/** 矩阵中可编辑并参与变更比对的字段（关键限值等） */
export type MatrixStepField = 'limit' | 'frequency' | 'correctiveAction'

export interface ProcessStep {
  id: string
  name: string
  equipment: string
  hazard: string
  controlPoint: string
  limit: string
  frequency: string
  correctiveAction: string
}

/** 已发布的控制矩阵版本：发布后只读，开工批次与偏差永远指向其中某一版 */
export interface MatrixVersion {
  version: number
  publishedAt: string
  publishedBy: string
  reason: string
  /** 本版基于的上一版号；V1 为 null */
  basedOnVersion: number | null
  steps: ProcessStep[]
}

/** 同一控制点在相邻版本间的一处字段变更（变更前 / 变更后） */
export interface MatrixFieldChange {
  stepId: string
  stepName: string
  field: MatrixStepField
  before: string
  after: string
}

export interface MonitoringValue {
  stepId: string
  value: number
  unit: string
  recordedAt: string
  operator: string
}

export interface Batch {
  id: string
  product: string
  line: string
  quantity: number
  producedAt: string
  status: BatchStatus
  isolationScope: string
  monitoring: MonitoringValue[]
  /** 单据修订号（状态流转等），不影响所引用的控制矩阵版本 */
  version: number
  /** 开工时采用的控制矩阵版本号 */
  matrixVersion: number
}

export interface Investigation {
  cause: string
  evidence: string
  decision: DecisionType
  reworkInstruction: string
}

export interface Deviation {
  id: string
  batchId: string
  stepId: string
  title: string
  severity: '一般' | '重大'
  status: DeviationStatus
  owner: string
  openedAt: string
  dueDate: string
  investigation: Investigation
  reviewNote: string
  reviewer: string
  version: number
  /** 偏差登记时锁定的控制矩阵版本号（与开工版本一致） */
  matrixVersion: number
}

export interface AuditEntry {
  id: string
  entity: string
  action: string
  operator: string
  detail: string
  createdAt: string
}
