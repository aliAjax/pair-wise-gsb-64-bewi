import { useState } from 'react'
import { Button, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'

export function AuditTrail() {
  const state = useSelector((root: RootState) => root.haccp)
  const entries = state.audit
  const [keyword, setKeyword] = useState('')
  const rows = entries.filter((item) => `${item.entity} ${item.action} ${item.operator} ${item.detail} ${item.stepId ?? ''} V${item.stepVersion ?? ''}`.includes(keyword))
  const exportAudit = () => {
    // 追溯包同时导出已发布版本链与各批次开工快照，确保“当时按哪一版控制”可离线复核
    const pack = {
      exportedAt: new Date().toISOString(),
      publishedMatrixVersions: state.matrixVersions,
      batches: state.batches.map((batch) => ({
        id: batch.id, product: batch.product, producedAt: batch.producedAt, status: batch.status,
        baselineMatrix: batch.stepSnapshots
      })),
      deviations: state.deviations.map((deviation) => ({
        id: deviation.id, batchId: deviation.batchId, stepId: deviation.stepId,
        stepVersion: deviation.stepVersion, status: deviation.status, title: deviation.title
      })),
      audit: entries
    }
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'HACCP追溯审计.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <section className="page"><header className="page-head"><div><p>批次 / 控制点 / 偏差 / 签字</p><h1>完整追溯审计</h1></div><Button appearance="primary" onClick={exportAudit}>导出追溯包</Button></header>
    <div className="toolbar"><Input value={keyword} onChange={(_, data) => setKeyword(data.value)} placeholder="搜索实体、动作、操作人或控制点版本" /><span>共{rows.length}条可追溯事件；涉及控制点的事件标注当时版本号</span></div>
    <div className="table-panel"><Table size="small"><TableHeader><TableRow><TableHeaderCell>时间</TableHeaderCell><TableHeaderCell>实体</TableHeaderCell><TableHeaderCell>动作</TableHeaderCell><TableHeaderCell>控制点版本</TableHeaderCell><TableHeaderCell>操作人</TableHeaderCell><TableHeaderCell>说明</TableHeaderCell></TableRow></TableHeader><TableBody>{rows.map((item) => <TableRow key={item.id}><TableCell>{item.createdAt.replace('T', ' ').slice(0, 16)}</TableCell><TableCell>{item.entity}</TableCell><TableCell>{item.action}</TableCell><TableCell>{item.stepId ? `${item.stepId} V${item.stepVersion}` : '—'}</TableCell><TableCell>{item.operator}</TableCell><TableCell>{item.detail}</TableCell></TableRow>)}</TableBody></Table></div>
  </section>
}
