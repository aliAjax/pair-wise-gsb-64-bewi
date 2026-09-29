import type { AuditEntry, Batch, Deviation, MatrixVersion, ProcessStep } from '../types'

/** 控制点基础信息（设备、危害、控制点名称不随版本变化） */
export const processSteps: ProcessStep[] = [
  { id: 'P1', name: '原料验收', equipment: '冷藏收货台', hazard: '致病菌、温度失控', controlPoint: '原料中心温度' },
  { id: 'P2', name: '巴氏杀菌', equipment: 'HTST-02', hazard: '致病菌残留', controlPoint: '杀菌温度' },
  { id: 'P3', name: '金属探测', equipment: 'MD-06', hazard: '金属异物', controlPoint: 'Fe/SUS灵敏度' },
  { id: 'P4', name: '灌装封口', equipment: 'FILL-01', hazard: '密封不良', controlPoint: '封口压力' },
  { id: 'P5', name: '终产品冷却', equipment: '冷却隧道', hazard: '芽孢萌发', controlPoint: '冷却结束温度' }
]

/**
 * 已发布控制矩阵版本：按控制点独立编号形成版本链。
 * P2、P4各有两个已发布版本，用于演示批次/偏差继续指向开工版本。
 */
export const seedMatrixVersions: MatrixVersion[] = [
  { stepId: 'P1', version: 1, basedOnVersion: null, limit: '≤ 4 ℃', frequency: '每批', correctiveAction: '拒收并隔离供应商批次', changeReason: 'HACCP计划首次发布', publishedBy: '质量负责人 秦岚', publishedAt: '2026-09-20T09:00:00' },
  { stepId: 'P2', version: 1, basedOnVersion: null, limit: '≥ 71.5 ℃ / 15 s', frequency: '连续记录', correctiveAction: '自动回流并触发偏差', changeReason: 'HACCP计划首次发布', publishedBy: '质量负责人 秦岚', publishedAt: '2026-09-20T09:00:00' },
  { stepId: 'P2', version: 2, basedOnVersion: 1, limit: '≥ 72 ℃ / 15 s', frequency: '连续记录', correctiveAction: '自动回流并触发偏差，隔离30分钟内产品', changeReason: '依据杀菌验证报告提高温度限值并细化隔离要求', publishedBy: '质量负责人 秦岚', publishedAt: '2026-09-28T20:30:00' },
  { stepId: 'P3', version: 1, basedOnVersion: null, limit: 'Fe 1.5 mm / SUS 2.0 mm', frequency: '每半小时', correctiveAction: '隔离末次合格点以来产品', changeReason: 'HACCP计划首次发布', publishedBy: '质量负责人 秦岚', publishedAt: '2026-09-20T09:00:00' },
  { stepId: 'P4', version: 1, basedOnVersion: null, limit: '0.35-0.45 MPa', frequency: '每小时', correctiveAction: '停机调机并复检留样', changeReason: 'HACCP计划首次发布', publishedBy: '质量负责人 秦岚', publishedAt: '2026-09-20T09:00:00' },
  { stepId: 'P4', version: 2, basedOnVersion: 1, limit: '0.38-0.45 MPa', frequency: '每半小时', correctiveAction: '停机调机并复检留样', changeReason: '缩窄封口压力下限并加密监控频率，降低密封不良风险', publishedBy: '质量负责人 秦岚', publishedAt: '2026-09-29T09:30:00' },
  { stepId: 'P5', version: 1, basedOnVersion: null, limit: '≤ 10 ℃ / 2 h', frequency: '每批', correctiveAction: '延长冷却并观察质量', changeReason: 'HACCP计划首次发布', publishedBy: '质量负责人 秦岚', publishedAt: '2026-09-20T09:00:00' }
]

export const seedBatches: Batch[] = [
  {
    id: 'B260929-01', product: '低温鲜奶 950mL', line: 'L1', quantity: 3200, producedAt: '2026-09-29T06:20:00', status: '隔离中', isolationScope: '杀菌后至金属探测前全部在制品', version: 4,
    // 06:20开工，P2 V2已于09-28 20:30发布故取V2；P4 V2当日09:30才发布，仍取V1
    stepSnapshots: [
      { stepId: 'P1', version: 1, controlPoint: '原料中心温度', limit: '≤ 4 ℃', frequency: '每批', correctiveAction: '拒收并隔离供应商批次' },
      { stepId: 'P2', version: 2, controlPoint: '杀菌温度', limit: '≥ 72 ℃ / 15 s', frequency: '连续记录', correctiveAction: '自动回流并触发偏差，隔离30分钟内产品' },
      { stepId: 'P3', version: 1, controlPoint: 'Fe/SUS灵敏度', limit: 'Fe 1.5 mm / SUS 2.0 mm', frequency: '每半小时', correctiveAction: '隔离末次合格点以来产品' },
      { stepId: 'P4', version: 1, controlPoint: '封口压力', limit: '0.35-0.45 MPa', frequency: '每小时', correctiveAction: '停机调机并复检留样' },
      { stepId: 'P5', version: 1, controlPoint: '冷却结束温度', limit: '≤ 10 ℃ / 2 h', frequency: '每批', correctiveAction: '延长冷却并观察质量' }
    ],
    monitoring: [
      { stepId: 'P1', value: 3.4, unit: '℃', recordedAt: '2026-09-29T06:25:00', operator: '陈莉' },
      { stepId: 'P2', value: 70.8, unit: '℃', recordedAt: '2026-09-29T06:48:00', operator: '系统采集' },
      { stepId: 'P3', value: 1.5, unit: 'mm Fe', recordedAt: '2026-09-29T07:20:00', operator: '杨鸣' }
    ]
  },
  {
    id: 'B260929-02', product: '原味酸奶 200g', line: 'L2', quantity: 8600, producedAt: '2026-09-29T08:10:00', status: '待复核', isolationScope: 'FILL-01本次清洁后产品', version: 3,
    // 08:10开工，早于P4 V2(当日09:30发布)，故封口压力继续执行开工版本V1
    stepSnapshots: [
      { stepId: 'P1', version: 1, controlPoint: '原料中心温度', limit: '≤ 4 ℃', frequency: '每批', correctiveAction: '拒收并隔离供应商批次' },
      { stepId: 'P2', version: 2, controlPoint: '杀菌温度', limit: '≥ 72 ℃ / 15 s', frequency: '连续记录', correctiveAction: '自动回流并触发偏差，隔离30分钟内产品' },
      { stepId: 'P3', version: 1, controlPoint: 'Fe/SUS灵敏度', limit: 'Fe 1.5 mm / SUS 2.0 mm', frequency: '每半小时', correctiveAction: '隔离末次合格点以来产品' },
      { stepId: 'P4', version: 1, controlPoint: '封口压力', limit: '0.35-0.45 MPa', frequency: '每小时', correctiveAction: '停机调机并复检留样' },
      { stepId: 'P5', version: 1, controlPoint: '冷却结束温度', limit: '≤ 10 ℃ / 2 h', frequency: '每批', correctiveAction: '延长冷却并观察质量' }
    ],
    monitoring: [
      { stepId: 'P4', value: 0.34, unit: 'MPa', recordedAt: '2026-09-29T08:40:00', operator: '系统采集' },
      { stepId: 'P5', value: 8.2, unit: '℃', recordedAt: '2026-09-29T10:10:00', operator: '郑凯' }
    ]
  },
  {
    id: 'B260928-07', product: '低脂牛奶 1L', line: 'L1', quantity: 5100, producedAt: '2026-09-28T16:20:00', status: '已放行', isolationScope: '无', version: 6,
    // 09-28下午开工，早于当日20:30发布的P2 V2，故P2仍执行V1旧限值
    stepSnapshots: [
      { stepId: 'P1', version: 1, controlPoint: '原料中心温度', limit: '≤ 4 ℃', frequency: '每批', correctiveAction: '拒收并隔离供应商批次' },
      { stepId: 'P2', version: 1, controlPoint: '杀菌温度', limit: '≥ 71.5 ℃ / 15 s', frequency: '连续记录', correctiveAction: '自动回流并触发偏差' },
      { stepId: 'P3', version: 1, controlPoint: 'Fe/SUS灵敏度', limit: 'Fe 1.5 mm / SUS 2.0 mm', frequency: '每半小时', correctiveAction: '隔离末次合格点以来产品' },
      { stepId: 'P4', version: 1, controlPoint: '封口压力', limit: '0.35-0.45 MPa', frequency: '每小时', correctiveAction: '停机调机并复检留样' },
      { stepId: 'P5', version: 1, controlPoint: '冷却结束温度', limit: '≤ 10 ℃ / 2 h', frequency: '每批', correctiveAction: '延长冷却并观察质量' }
    ],
    monitoring: processSteps.map((step, index) => ({ stepId: step.id, value: [3.0, 73.2, 1.2, 0.41, 7.8][index], unit: ['℃', '℃', 'mm Fe', 'MPa', '℃'][index], recordedAt: '2026-09-28T17:00:00', operator: '生产线记录' }))
  }
]

export const seedDeviations: Deviation[] = [
  {
    id: 'DEV-260929-01', batchId: 'B260929-01', stepId: 'P2', title: '杀菌温度低于关键限值', severity: '重大', status: '调查中', owner: '质量工程组', openedAt: '2026-09-29T06:55:00', dueDate: '2026-09-29', version: 3, stepVersion: 2,
    investigation: { cause: '蒸汽调节阀响应滞后', evidence: '趋势图显示70.8℃持续42秒；阀门检修记录已上传', decision: '返工', reworkInstruction: '隔离产品全部回流至平衡槽，重新杀菌并留样验证' }, reviewNote: '', reviewer: ''
  },
  {
    id: 'DEV-260929-02', batchId: 'B260929-02', stepId: 'P4', title: '封口压力偏低', severity: '一般', status: '待复核', owner: '设备保障组', openedAt: '2026-09-29T08:52:00', dueDate: '2026-09-30', version: 2, stepVersion: 1,
    investigation: { cause: '气缸密封圈磨损', evidence: '压力曲线、拆检照片、备件领用单', decision: '返工', reworkInstruction: '更换密封圈，返封隔离产品并恢复压力。' }, reviewNote: '', reviewer: ''
  }
]

export const seedAudit: AuditEntry[] = [
  { id: 'AUD-1', entity: 'B260929-01', action: '自动创建偏差', operator: '监控系统', detail: '杀菌温度70.8℃低于开工版本V2限值≥72℃，批次已隔离', createdAt: '2026-09-29T06:55:00', stepId: 'P2', stepVersion: 2 },
  { id: 'AUD-2', entity: 'DEV-260929-01', action: '提交调查', operator: '质量工程组', detail: '记录蒸汽阀响应滞后与趋势证据（依据控制点P2 V2）', createdAt: '2026-09-29T08:15:00', stepId: 'P2', stepVersion: 2 },
  { id: 'AUD-3', entity: 'B260929-02', action: '状态流转', operator: '杨鸣', detail: '由生产中转为待复核', createdAt: '2026-09-29T08:52:00' },
  { id: 'AUD-4', entity: 'P4', action: '发布控制矩阵版本', operator: '质量负责人 秦岚', detail: 'P4 封口压力 V1→V2：限值0.35-0.45 MPa→0.38-0.45 MPa；频率每小时→每半小时。原因：缩窄封口压力下限并加密监控频率，降低密封不良风险', createdAt: '2026-09-29T09:30:00', stepId: 'P4', stepVersion: 2 },
  { id: 'AUD-5', entity: 'P2', action: '发布控制矩阵版本', operator: '质量负责人 秦岚', detail: 'P2 杀菌温度 V1→V2：限值≥71.5℃/15s→≥72℃/15s。原因：依据杀菌验证报告提高温度限值并细化隔离要求', createdAt: '2026-09-28T20:30:00', stepId: 'P2', stepVersion: 2 }
]
