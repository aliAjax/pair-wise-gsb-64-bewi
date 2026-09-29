import { useState } from 'react'
import { Badge, Button, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import { latestVersion } from '../services/matrix'

export function AuditTrail() {
  const state = useSelector((root: RootState) => root.haccp)
  const { audit, matrixVersions, batches, deviations } = state
  const [keyword, setKeyword] = useState('')
  const rows = audit.filter((item) => `${item.entity} ${item.action} ${item.operator} ${item.detail}`.includes(keyword))
  const current = latestVersion(matrixVersions)
  const exportAudit = () => {
    const tracePackage = {
      exportedAt: new Date().toISOString(),
      currentMatrixVersion: current.version,
      matrixVersions: matrixVersions.map((item) => ({
        version: item.version,
        basedOnVersion: item.basedOnVersion,
        publishedAt: item.publishedAt,
        publishedBy: item.publishedBy,
        reason: item.reason,
        steps: item.steps
      })),
      batches: batches.map((item) => ({ id: item.id, product: item.product, status: item.status, matrixVersion: item.matrixVersion, recordVersion: item.version })),
      deviations: deviations.map((item) => ({ id: item.id, batchId: item.batchId, stepId: item.stepId, status: item.status, matrixVersion: item.matrixVersion, recordVersion: item.version })),
      audit
    }
    const blob = new Blob([JSON.stringify(tracePackage, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'HACCP追溯审计.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <section className="page"><header className="page-head"><div><p>批次 / 控制点 / 偏差 / 签字</p><h1>完整追溯审计</h1></div><Button appearance="primary" onClick={exportAudit}>导出追溯包</Button></header>
    <div className="version-summary">
      {[...matrixVersions].reverse().map((item) => (
        <div key={item.version} className={item.version === current.version ? 'active' : ''}>
          <strong>V{item.version}</strong>
          <span>{item.basedOnVersion === null ? '首版' : `基于V${item.basedOnVersion}`}</span>
          <small>{item.publishedAt.slice(0, 10)} · {item.publishedBy}</small>
        </div>
      ))}
      <div className="version-summary-note"><Badge appearance="tint" color="success">当前 V{current.version}</Badge><span>每个批次与偏差均锁定其开工版本；发布新版不回写历史记录。</span></div>
    </div>
    <div className="toolbar"><Input value={keyword} onChange={(_, data) => setKeyword(data.value)} placeholder="搜索实体、动作、操作人" /><span>共{rows.length}条可追溯事件（含发布原因与变更前后限值）</span></div>
    <div className="table-panel"><Table size="small"><TableHeader><TableRow><TableHeaderCell>时间</TableHeaderCell><TableHeaderCell>实体</TableHeaderCell><TableHeaderCell>动作</TableHeaderCell><TableHeaderCell>操作人</TableHeaderCell><TableHeaderCell>说明</TableHeaderCell></TableRow></TableHeader><TableBody>{rows.map((item) => <TableRow key={item.id}><TableCell>{item.createdAt.replace('T', ' ').slice(0, 16)}</TableCell><TableCell>{item.entity}</TableCell><TableCell>{item.action}</TableCell><TableCell>{item.operator}</TableCell><TableCell>{item.detail}</TableCell></TableRow>)}</TableBody></Table></div>
  </section>
}
