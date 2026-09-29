import type { AuditEntry, Batch, Deviation, MatrixVersion, ProcessStep } from '../types'
import { diffSteps, formatChange } from '../services/matrix'

const step = (id: string, name: string, equipment: string, hazard: string, controlPoint: string, limit: string, frequency: string, correctiveAction: string): ProcessStep =>
  ({ id, name, equipment, hazard, controlPoint, limit, frequency, correctiveAction })

const v1Steps: ProcessStep[] = [
  step('P1', '原料验收', '冷藏收货台', '致病菌、温度失控', '原料中心温度', '≤ 5 ℃', '每批', '拒收并隔离供应商批次'),
  step('P2', '巴氏杀菌', 'HTST-02', '致病菌残留', '杀菌温度', '≥ 71.7 ℃ / 15 s', '连续记录', '自动回流并触发偏差'),
  step('P3', '金属探测', 'MD-06', '金属异物', 'Fe/SUS灵敏度', 'Fe 2.0 mm / SUS 2.5 mm', '每半小时', '隔离末次合格点以来产品'),
  step('P4', '灌装封口', 'FILL-01', '密封不良', '封口压力', '0.35-0.48 MPa', '每小时', '停机调机并复检留样'),
  step('P5', '终产品冷却', '冷却隧道', '芽孢萌发', '冷却结束温度', '≤ 12 ℃ / 3 h', '每批', '延长冷却并观察质量')
]

interface ReleaseMeta { publishedAt: string; publishedBy: string; reason: string; override: Array<[string, Partial<Pick<ProcessStep, 'limit' | 'frequency' | 'correctiveAction'>>]> }

const releases: ReleaseMeta[] = [
  {
    publishedAt: '2026-05-06T09:30:00', publishedBy: '质量主管 周衡', reason: '年度HACCP复审，依据近一年致病菌监测数据收紧原料温度限值。',
    override: [['P1', { limit: '≤ 4 ℃' }]]
  },
  {
    publishedAt: '2026-06-11T14:10:00', publishedBy: '质量主管 周衡', reason: '杀菌工艺验证完成，按法规将温度限值对齐到72℃并统一监控频率表述。',
    override: [['P2', { limit: '≥ 72 ℃ / 15 s' }], ['P3', { frequency: '每20分钟' }]]
  },
  {
    publishedAt: '2026-07-20T10:05:00', publishedBy: '质量经理 何静', reason: '客户异物投诉专项整改，提高金属探测灵敏度并缩短点检间隔。',
    override: [['P3', { limit: 'Fe 1.5 mm / SUS 2.0 mm' }], ['P5', { limit: '≤ 10 ℃ / 2 h' }]]
  },
  {
    publishedAt: '2026-08-18T16:40:00', publishedBy: '质量经理 何静', reason: '封口泄漏不良率升高，收紧封口压力窗口。',
    override: [['P4', { limit: '0.38-0.45 MPa' }]]
  },
  {
    publishedAt: '2026-09-15T11:20:00', publishedBy: '质量负责人 秦岚', reason: '金属探测器换型后验证通过，监控频率恢复半小时一次。',
    override: [['P3', { frequency: '每半小时' }]]
  }
]

function buildVersions(): MatrixVersion[] {
  const versions: MatrixVersion[] = [
    { version: 1, publishedAt: '2026-03-02T08:00:00', publishedBy: 'HACCP小组', reason: '控制矩阵首次发布（HACCP计划V1）。', basedOnVersion: null, steps: v1Steps }
  ]
  for (const meta of releases) {
    const previous = versions[versions.length - 1]
    const steps = previous.steps.map((item) => {
      const patch = meta.override.find(([id]) => id === item.id)?.[1]
      return patch ? { ...item, ...patch } : item
    })
    versions.push({ version: previous.version + 1, publishedAt: meta.publishedAt, publishedBy: meta.publishedBy, reason: meta.reason, basedOnVersion: previous.version, steps })
  }
  return versions
}

export const seedMatrixVersions: MatrixVersion[] = buildVersions()

/** 新建批次默认引用当前已发布版本（V6）；演示初始无未发布草稿。 */
export const seedDraftSteps: ProcessStep[] = structuredClone(seedMatrixVersions[seedMatrixVersions.length - 1].steps)
export const seedDraftReason = ''

export const seedBatches: Batch[] = [
  {
    id: 'B260929-01', product: '低温鲜奶 950mL', line: 'L1', quantity: 3200, producedAt: '2026-09-29T06:20:00', status: '隔离中', isolationScope: '杀菌后至金属探测前全部在制品', version: 4, matrixVersion: 6,
    monitoring: [
      { stepId: 'P1', value: 3.4, unit: '℃', recordedAt: '2026-09-29T06:25:00', operator: '陈莉' },
      { stepId: 'P2', value: 70.8, unit: '℃', recordedAt: '2026-09-29T06:48:00', operator: '系统采集' },
      { stepId: 'P3', value: 1.5, unit: 'mm Fe', recordedAt: '2026-09-29T07:20:00', operator: '杨鸣' }
    ]
  },
  {
    id: 'B260929-02', product: '原味酸奶 200g', line: 'L2', quantity: 8600, producedAt: '2026-09-29T08:10:00', status: '待复核', isolationScope: 'FILL-01本次清洁后产品', version: 3, matrixVersion: 6,
    monitoring: [
      { stepId: 'P4', value: 0.36, unit: 'MPa', recordedAt: '2026-09-29T08:40:00', operator: '系统采集' },
      { stepId: 'P5', value: 8.2, unit: '℃', recordedAt: '2026-09-29T10:10:00', operator: '郑凯' }
    ]
  },
  {
    id: 'B260928-07', product: '低脂牛奶 1L', line: 'L1', quantity: 5100, producedAt: '2026-09-28T16:20:00', status: '已放行', isolationScope: '无', version: 6, matrixVersion: 6,
    monitoring: seedMatrixVersions[5].steps.map((stepItem, index) => ({ stepId: stepItem.id, value: [3.0, 73.2, 1.2, 0.41, 7.8][index], unit: ['℃', '℃', 'mm Fe', 'MPa', '℃'][index], recordedAt: '2026-09-28T17:00:00', operator: '生产线记录' }))
  },
  {
    id: 'B260810-03', product: '高钙鲜奶 500mL', line: 'L1', quantity: 4400, producedAt: '2026-08-10T07:05:00', status: '已放行', isolationScope: '无', version: 2, matrixVersion: 4,
    monitoring: [
      { stepId: 'P1', value: 3.6, unit: '℃', recordedAt: '2026-08-10T07:10:00', operator: '陈莉' },
      { stepId: 'P3', value: 1.5, unit: 'mm Fe', recordedAt: '2026-08-10T08:00:00', operator: '杨鸣' },
      { stepId: 'P4', value: 0.40, unit: 'MPa', recordedAt: '2026-08-10T08:30:00', operator: '冯磊' }
    ]
  }
]

export const seedDeviations: Deviation[] = [
  {
    id: 'DEV-260929-01', batchId: 'B260929-01', stepId: 'P2', title: '杀菌温度低于关键限值', severity: '重大', status: '调查中', owner: '质量工程组', openedAt: '2026-09-29T06:55:00', dueDate: '2026-09-29', version: 3, matrixVersion: 6,
    investigation: { cause: '蒸汽调节阀响应滞后', evidence: '趋势图显示70.8℃持续42秒；阀门检修记录已上传', decision: '返工', reworkInstruction: '隔离产品全部回流至平衡槽，重新杀菌并留样验证' }, reviewNote: '', reviewer: ''
  },
  {
    id: 'DEV-260929-02', batchId: 'B260929-02', stepId: 'P4', title: '封口压力偏低', severity: '一般', status: '待复核', owner: '设备保障组', openedAt: '2026-09-29T08:52:00', dueDate: '2026-09-30', version: 2, matrixVersion: 6,
    investigation: { cause: '气缸密封圈磨损', evidence: '压力曲线、拆检照片、备件领用单', decision: '返工', reworkInstruction: '更换密封圈，返封隔离产品并恢复压力。' }, reviewNote: '', reviewer: ''
  }
]

function buildSeedAudit(): AuditEntry[] {
  const matrixEntries: AuditEntry[] = []
  for (let i = 1; i < seedMatrixVersions.length; i += 1) {
    const current = seedMatrixVersions[i]
    const previous = seedMatrixVersions[i - 1]
    const summary = diffSteps(previous.steps, current.steps).map(formatChange).join('；')
    matrixEntries.push({
      id: `AUD-MX-V${current.version}`,
      entity: `控制矩阵 V${current.version}`,
      action: '发布控制矩阵',
      operator: current.publishedBy,
      detail: `基于V${previous.version}发布V${current.version}：${summary}。变更原因：${current.reason}`,
      createdAt: current.publishedAt
    })
  }
  matrixEntries.push({
    id: 'AUD-MX-V1',
    entity: '控制矩阵 V1',
    action: '发布控制矩阵',
    operator: 'HACCP小组',
    detail: '控制矩阵首次发布。变更原因：HACCP计划V1。',
    createdAt: seedMatrixVersions[0].publishedAt
  })

  const businessEntries: AuditEntry[] = [
    { id: 'AUD-3', entity: 'B260929-02', action: '状态流转', operator: '杨鸣', detail: '由生产中转为待复核（开工版本V6）', createdAt: '2026-09-29T08:52:00' },
    { id: 'AUD-2', entity: 'DEV-260929-01', action: '提交调查', operator: '质量工程组', detail: '记录蒸汽阀响应滞后与趋势证据（依据开工版本V6限值 ≥ 72 ℃ / 15 s）', createdAt: '2026-09-29T08:15:00' },
    { id: 'AUD-1', entity: 'B260929-01', action: '自动创建偏差', operator: '监控系统', detail: '杀菌温度70.8℃低于V6限值72℃，批次已隔离（开工版本V6）', createdAt: '2026-09-29T06:55:00' },
    { id: 'AUD-4', entity: 'B260810-03', action: '签字放行', operator: '质量负责人 秦岚', detail: '历史批次已放行，追溯锁定开工版本V4（当时封口压力限值0.35-0.48 MPa）', createdAt: '2026-08-10T15:30:00' }
  ]

  return [...businessEntries, ...matrixEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const seedAudit: AuditEntry[] = buildSeedAudit()
