import { useMemo, useState } from 'react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field, Input, Option, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@fluentui/react-components'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { setBatchFilter, setBatchStatus, setSelectedBatch, startBatch, updateBatchStatus } from '../store/haccpSlice'
import type { BatchStatus } from '../types'
import { useLoadBatchSnapshotQuery } from '../services/api'
import { snapshotAt, violatesLimit } from '../services/matrix'

const statuses: Array<BatchStatus | '全部'> = ['全部', '生产中', '待复核', '可放行', '隔离中', '已放行', '已报废']
const statusColor = (status: BatchStatus) => status === '隔离中' || status === '已报废' ? 'danger' : status === '已放行' ? 'success' : status === '可放行' ? 'important' : 'warning'
const fmt = (iso: string) => iso.replace('T', ' ').slice(0, 16)
const shortVersions = (snapshots: Array<{ stepId: string; version: number }>) => {
  const groups = new Map<number, string[]>()
  snapshots.forEach((item) => { groups.set(item.version, [...(groups.get(item.version) ?? []), item.stepId]) })
  return [...groups.entries()].map(([version, ids]) => `V${version}（${ids.join('/')}）`).join('，')
}

export function Overview() {
  const dispatch = useDispatch<AppDispatch>()
  const state = useSelector((root: RootState) => root.haccp)
  const { isFetching } = useLoadBatchSnapshotQuery()
  const [showStart, setShowStart] = useState(false)
  const [newBatch, setNewBatch] = useState({ product: '', line: 'L1', quantity: 1000 })
  const rows = useMemo(() => state.batches.filter((batch) => {
    const text = `${batch.id} ${batch.product} ${batch.line}`.toLowerCase()
    return (!state.batchFilter || text.includes(state.batchFilter.toLowerCase())) && (state.batchStatus === '全部' || batch.status === state.batchStatus)
  }), [state.batches, state.batchFilter, state.batchStatus])
  const selected = state.batches.find((item) => item.id === state.selectedBatchId) ?? rows[0]
  const selectedDeviations = state.deviations.filter((item) => item.batchId === selected?.id)

  const confirmStart = () => {
    if (!newBatch.product.trim()) return
    dispatch(startBatch({ product: newBatch.product, line: newBatch.line, quantity: Number(newBatch.quantity) || 0 }))
    setNewBatch({ product: '', line: 'L1', quantity: 1000 })
    setShowStart(false)
  }

  return (
    <section className="page">
      <header className="page-head">
        <div><p>质量运营中心 / 批次控制</p><h1>生产批次与放行</h1></div>
        <div className="head-actions">
          <span className="sync-state">{isFetching ? <Spinner size="extra-tiny" /> : '批次快照已加载'}</span>
          <Button appearance="primary" onClick={() => setShowStart(true)}>开工新批次</Button>
        </div>
      </header>
      <div className="metrics">
        <article><span>今日批次</span><strong>{state.batches.length}</strong><small>覆盖2条生产线</small></article>
        <article><span>隔离批次</span><strong>{state.batches.filter((item) => item.status === '隔离中').length}</strong><small>禁止放行</small></article>
        <article><span>未关闭偏差</span><strong>{state.deviations.filter((item) => item.status !== '已关闭').length}</strong><small>需调查或复核</small></article>
        <article><span>已放行</span><strong>{state.batches.filter((item) => item.status === '已放行').length}</strong><small>已完成签字</small></article>
      </div>
      <div className="toolbar">
        <Input value={state.batchFilter} onChange={(_, data) => dispatch(setBatchFilter(data.value))} placeholder="搜索批次、产品、产线" />
        <Dropdown value={state.batchStatus} selectedOptions={[state.batchStatus]} onOptionSelect={(_, data) => dispatch(setBatchStatus(data.optionValue as BatchStatus | '全部'))}>
          {statuses.map((status) => <Option key={status} value={status}>{status}</Option>)}
        </Dropdown>
        <span>批次按开工时已发布控制矩阵执行，发布新版本不会改写已开工/隔离批次</span>
      </div>
      <div className="split-layout">
        <div className="table-panel">
          <Table size="small" aria-label="生产批次">
            <TableHeader><TableRow><TableHeaderCell>批次</TableHeaderCell><TableHeaderCell>产品</TableHeaderCell><TableHeaderCell>产线</TableHeaderCell><TableHeaderCell>状态</TableHeaderCell><TableHeaderCell>开工矩阵版本</TableHeaderCell></TableRow></TableHeader>
            <TableBody>
              {rows.map((batch) => <TableRow key={batch.id} onClick={() => dispatch(setSelectedBatch(batch.id))} className={batch.id === selected?.id ? 'selected-row' : ''}>
                <TableCell>{batch.id}</TableCell><TableCell>{batch.product}</TableCell><TableCell>{batch.line}</TableCell>
                <TableCell><Badge appearance="tint" color={statusColor(batch.status)}>{batch.status}</Badge></TableCell>
                <TableCell><small>{shortVersions(batch.stepSnapshots)}</small></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        {selected && <aside className="record-panel">
          <div className="record-title"><div><span>{selected.id} · {selected.line} · 开工 {fmt(selected.producedAt)}</span><h2>{selected.product}</h2></div><Badge color={statusColor(selected.status)}>{selected.status}</Badge></div>
          <dl>
            <div><dt>生产数量</dt><dd>{selected.quantity.toLocaleString()} 件</dd></div>
            <div><dt>隔离范围</dt><dd>{selected.isolationScope}</dd></div>
            <div><dt>关联偏差</dt><dd>{selectedDeviations.length} 项</dd></div>
            <div><dt>开工矩阵版本</dt><dd>{shortVersions(selected.stepSnapshots)}</dd></div>
          </dl>
          <p className="pinned-note">本批次按上述开工版本判定与追溯；控制矩阵后续发布的新版本不适用于本批次。</p>
          <h3>监测点结果（对照开工版本限值）</h3>
          <div className="monitoring-list">
            {selected.monitoring.length === 0 && <p className="muted-text">暂无监测记录。</p>}
            {selected.monitoring.map((item) => {
              const snap = snapshotAt(selected, item.stepId)
              const step = state.processSteps.find((entry) => entry.id === item.stepId)
              const breached = snap ? violatesLimit(item.value, item.unit, snap.limit) : false
              return <div key={`${selected.id}-${item.stepId}`} className={breached ? 'breach' : ''}>
                <span>{step?.controlPoint ?? snap?.controlPoint}<small className="snap-tag">开工 V{snap?.version ?? '—'}</small></span>
                <strong>{item.value} {item.unit}</strong>
                <small>限值 {snap?.limit ?? '—'} · {item.operator} · {fmt(item.recordedAt)}</small>
                {breached && <small className="breach-tag">偏离开工版本限值</small>}
              </div>
            })}
          </div>
          <div className="record-actions">
            <Button appearance="secondary" disabled={selectedDeviations.some((item) => item.status !== '已关闭')} onClick={() => dispatch(updateBatchStatus({ id: selected.id, status: '可放行' }))}>提交放行复核</Button>
            <Button appearance="primary" disabled={selected.status !== '可放行'} onClick={() => dispatch(updateBatchStatus({ id: selected.id, status: '已放行' }))}>签字放行</Button>
          </div>
          {selectedDeviations.some((item) => item.status !== '已关闭') && <p className="validation-text">存在未关闭偏差，系统已阻止标记为可放行。</p>}
        </aside>}
      </div>

      <Dialog open={showStart} onOpenChange={(_, data) => setShowStart(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>开工新批次</DialogTitle>
            <DialogContent>
              <p className="muted-text">开工即按当前已发布控制矩阵固化各控制点版本；草稿未发布前不生效，已开工批次不受后续发布影响。</p>
              <div className="dialog-fields">
                <Field label="产品名称" required><Input value={newBatch.product} onChange={(_, data) => setNewBatch({ ...newBatch, product: data.value })} placeholder="如：低温鲜奶 950mL" /></Field>
                <Field label="产线"><Dropdown value={newBatch.line} selectedOptions={[newBatch.line]} onOptionSelect={(_, data) => data.optionValue && setNewBatch({ ...newBatch, line: data.optionValue })}>{['L1', 'L2'].map((line) => <Option key={line} value={line}>{line}</Option>)}</Dropdown></Field>
                <Field label="数量（件）"><Input type="number" value={String(newBatch.quantity)} onChange={(_, data) => setNewBatch({ ...newBatch, quantity: Number(data.value) })} /></Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowStart(false)}>取消</Button>
              <Button appearance="primary" disabled={!newBatch.product.trim()} onClick={confirmStart}>确认开工</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  )
}
