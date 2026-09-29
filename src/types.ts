export type BatchStatus = '生产中' | '待复核' | '可放行' | '隔离中' | '已放行' | '已报废'
export type DeviationStatus = '待调查' | '调查中' | '待复核' | '已关闭'
export type DecisionType = '返工' | '报废' | '让步接收'

/** 控制点基础信息（不随版本变化的身份信息） */
export interface ProcessStep {
  id: string
  name: string
  equipment: string
  hazard: string
  controlPoint: string
}

/** 控制矩阵中会随版本变化的参数 */
export interface StepParameters {
  limit: string
  frequency: string
  correctiveAction: string
}

/** 已发布的控制矩阵版本（按控制点各自形成版本链，旧版只读、不可改写） */
export interface MatrixVersion extends StepParameters {
  stepId: string
  version: number
  basedOnVersion: number | null
  changeReason: string
  publishedBy: string
  publishedAt: string
}

/** 草稿：编辑只停留在此处，发布后才生成新的已发布版本 */
export interface MatrixDraft extends StepParameters {
  stepId: string
  updatedAt: string
}

/** 批次开工时固化的某控制点参数快照，批次终身指向该版本 */
export interface StepSnapshot extends StepParameters {
  stepId: string
  version: number
  controlPoint: string
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
  version: number
  /** 开工时各控制点参数快照（开工版本） */
  stepSnapshots: StepSnapshot[]
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
  /** 偏差发生（批次开工）时依据的控制点版本 */
  stepVersion: number
}

export interface AuditEntry {
  id: string
  entity: string
  action: string
  operator: string
  detail: string
  createdAt: string
  /** 审计事件关联的控制点及其版本，保证审计记录继续指向开工版本 */
  stepId?: string
  stepVersion?: number
}
