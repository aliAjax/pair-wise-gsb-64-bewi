import { useMemo, useState } from 'react'
import { Badge, Button, Dropdown, Field, Input, Option, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { setBatchFilter, setBatchStatus, setSelectedBatch, startBatch, updateBatchStatus } from '../store/haccpSlice'
import type { BatchStatus } from '../types'
import { findVersion, latestVersion, pinStep } from '../services/matrix'
import { useLoadBatchSnapshotQuery } from '../services/api'

const statuses: Array<BatchStatus | '全部'> = ['全部', '生产中', '待复核', '可放行', '隔离中', '已放行', '已报废']
const statusColor = (status: BatchStatus) => status === '隔离中' || status === '已报废' ? 'danger' : status === '已放行' ? 'success' : status === '可放行' ? 'important' : 'warning'
const lines = ['L1', 'L2']

export function Overview() {
  const dispatch = useDispatch<AppDispatch>()
  const state = useSelector((root: RootState) => root.haccp)
  const { isFetching } = useLoadBatchSnapshotQuery()
  const [showStart, setShowStart] = useState(false)
  const [newBatch, setNewBatch] = useState({ product: '', line: lines[0], quantity: 1000 })
  const rows = useMemo(() => state.batches.filter((batch) => {
    const text = `${batch.id} ${batch.product} ${batch.line}`.toLowerCase()
    return (!state.batchFilter || text.includes(state.batchFilter.toLowerCase())) && (state.batchStatus === '全部' || batch.status === state.batchStatus)
  }), [state.batches, state.batchFilter, state.batchStatus])
  const selected = state.batches.find((item) => item.id === state.selectedBatchId) ?? rows[0]
  const selectedDeviations = state.deviations.filter((item) => item.batchId === selected?.id)
  const currentVersion = latestVersion(state.matrixVersions)
  const selectedMatrix = selected ? findVersion(state.matrixVersions, selected.matrixVersion) : undefined
  const deviationStepIds = new Set(selectedDeviations.map((item) => item.stepId))

  return (
    <section className="page">
      <header className="page-head">
        <div><p>质量运营中心 / 批次控制</p><h1>生产批次与放行</h1></div>
        <div className="head-actions">
          <span className="sync-state">{isFetching ? '正在同步' : '批次快照已加载'}</span>
          <Button appearance="primary" onClick={() => setShowStart(true)}>开工建档</Button>
        </div>
      </header>
      <div className="metrics">
        <article><span>在档批次</span><strong>{state.batches.length}</strong><small>覆盖2条生产线</small></article>
        <article><span>隔离批次</span><strong>{state.batches.filter((item) => item.status === '隔离中').length}</strong><small>禁止放行</small></article>
        <article><span>未关闭偏差</span><strong>{state.deviations.filter((item) => item.status !== '已关闭').length}</strong><small>需调查或复核</small></article>
        <article><span>已放行</span><strong>{state.batches.filter((item) => item.status === '已放行').length}</strong><small>已完成签字</small></article>
      </div>
      <div className="toolbar">
        <Input value={state.batchFilter} onChange={(_, data) => dispatch(setBatchFilter(data.value))} placeholder="搜索批次、产品、产线" />
        <Dropdown value={state.batchStatus} selectedOptions={[state.batchStatus]} onOptionSelect={(_, data) => dispatch(setBatchStatus(data.optionValue as BatchStatus | '全部'))}>
          {statuses.map((status) => <Option key={status} value={status}>{status}</Option>)}
        </Dropdown>
        <span>新开工批次采用当前已发布 <b>V{currentVersion.version}</b>；历史批次始终显示其开工版本限值</span>
      </div>
      <div className="split-layout">
        <div className="table-panel">
          <Table size="small" aria-label="生产批次">
            <TableHeader><TableRow><TableHeaderCell>批次</TableHeaderCell><TableHeaderCell>产品</TableHeaderCell><TableHeaderCell>产线</TableHeaderCell><TableHeaderCell>状态</TableHeaderCell><TableHeaderCell>控制版本</TableHeaderCell></TableRow></TableHeader>
            <TableBody>
              {rows.map((batch) => <TableRow key={batch.id} onClick={() => dispatch(setSelectedBatch(batch.id))} className={batch.id === selected?.id ? 'selected-row' : ''}>
                <TableCell>{batch.id}</TableCell><TableCell>{batch.product}</TableCell><TableCell>{batch.line}</TableCell>
                <TableCell><Badge appearance="tint" color={statusColor(batch.status)}>{batch.status}</Badge></TableCell>
                <TableCell>
                  <Badge appearance="outline" color={batch.matrixVersion === currentVersion.version ? 'success' : 'informative'}>V{batch.matrixVersion}</Badge>
                  {batch.matrixVersion !== currentVersion.version && <small className="lag-version"> 非当前版</small>}
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        {selected && <aside className="record-panel">
          <div className="record-title"><div><span>{selected.id} · {selected.line}</span><h2>{selected.product}</h2></div><Badge color={statusColor(selected.status)}>{selected.status}</Badge></div>
          <dl>
            <div><dt>生产数量</dt><dd>{selected.quantity.toLocaleString()} 件</dd></div>
            <div><dt>隔离范围</dt><dd>{selected.isolationScope}</dd></div>
            <div><dt>关联偏差</dt><dd>{selectedDeviations.length} 项</dd></div>
            <div><dt>开工控制版本</dt><dd><strong>V{selected.matrixVersion}</strong>{selected.matrixVersion !== currentVersion.version && <small>（当前 V{currentVersion.version}，本批仍按 V{selected.matrixVersion} 判定）</small>}</dd></div>
          </dl>
          {selectedMatrix && <p className="version-meta">该版本发布于 {selectedMatrix.publishedAt.replace('T', ' ').slice(0, 16)}，由 {selectedMatrix.publishedBy} 发布；原因：{selectedMatrix.reason}</p>}
          <h3>监测点结果（按开工版本 V{selected.matrixVersion} 限值判定）</h3>
          <div className="monitoring-list">{selected.monitoring.map((item) => {
            const pinned = pinStep(state.matrixVersions, selected.matrixVersion, item.stepId)
            const flagged = deviationStepIds.has(item.stepId)
            return <div key={`${selected.id}-${item.stepId}`} className={flagged ? 'monitoring-deviation' : ''}>
              <span>{pinned?.controlPoint ?? item.stepId}</span><strong>{item.value} {item.unit}</strong>
              <small>{item.operator} · {item.recordedAt.slice(11, 16)} · 开工限值 {pinned?.limit ?? '—'}{flagged && ' · 已登记偏差'}</small>
            </div>
          })}{selected.monitoring.length === 0 && <small className="hint-text">开工后监测数据将在此按 V{selected.matrixVersion} 限值记录。</small>}</div>
          <div className="record-actions">
            <Button appearance="secondary" disabled={selectedDeviations.some((item) => item.status !== '已关闭')} onClick={() => dispatch(updateBatchStatus({ id: selected.id, status: '可放行' }))}>提交放行复核</Button>
            <Button appearance="primary" disabled={selected.status !== '可放行'} onClick={() => dispatch(updateBatchStatus({ id: selected.id, status: '已放行' }))}>签字放行</Button>
          </div>
          {selectedDeviations.some((item) => item.status !== '已关闭') && <p className="validation-text">存在未关闭偏差，系统已阻止标记为可放行。</p>}
        </aside>}
      </div>
      {showStart && <div className="edit-panel">
        <h3>开工建档 · 采用当前已发布控制矩阵 V{currentVersion.version}</h3>
        <div className="edit-grid">
          <Field label="产品名称"><Input value={newBatch.product} onChange={(_, data) => setNewBatch({ ...newBatch, product: data.value })} placeholder="如：低温鲜奶 950mL" /></Field>
          <Field label="产线"><Dropdown value={newBatch.line} selectedOptions={[newBatch.line]} onOptionSelect={(_, data) => setNewBatch({ ...newBatch, line: data.optionValue ?? lines[0] })}>{lines.map((line) => <Option key={line} value={line}>{line}</Option>)}</Dropdown></Field>
          <Field label="数量（件）"><Input type="number" value={String(newBatch.quantity)} onChange={(_, data) => setNewBatch({ ...newBatch, quantity: Number(data.value) })} /></Field>
        </div>
        <div className="record-actions">
          <Button onClick={() => setShowStart(false)}>取消</Button>
          <Button appearance="primary" disabled={!newBatch.product.trim() || newBatch.quantity <= 0} onClick={() => { dispatch(startBatch(newBatch)); setNewBatch({ product: '', line: lines[0], quantity: 1000 }); setShowStart(false) }}>按 V{currentVersion.version} 开工</Button>
        </div>
      </div>}
    </section>
  )
}
