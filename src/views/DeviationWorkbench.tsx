import { useMemo, useState } from 'react'
import { Badge, Button, Dropdown, Field, Input, Option, Textarea } from '@fluentui/react-components'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { createDeviation, reviewDeviation, saveInvestigation } from '../store/haccpSlice'
import type { DecisionType, Deviation, Investigation } from '../types'
import { latestPublished, snapshotAt } from '../services/matrix'

export function DeviationWorkbench() {
  const dispatch = useDispatch<AppDispatch>()
  const state = useSelector((root: RootState) => root.haccp)
  const [status, setStatus] = useState<Deviation['status'] | '全部'>('全部')
  const [selectedId, setSelectedId] = useState(state.deviations[0]?.id ?? '')
  const [showCreate, setShowCreate] = useState(false)
  const [newDeviation, setNewDeviation] = useState({ batchId: state.batches[0]?.id ?? '', stepId: state.processSteps[0]?.id ?? '', title: '', severity: '一般' as const, owner: '质量工程组' })
  const rows = useMemo(() => state.deviations.filter((item) => status === '全部' || item.status === status), [state.deviations, status])
  const selected = state.deviations.find((item) => item.id === selectedId) ?? rows[0]
  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const activeInvestigation = investigation?.cause === selected?.investigation.cause ? investigation : selected?.investigation

  const selectedBatch = state.batches.find((item) => item.id === selected?.batchId)
  const pinnedSnapshot = selected && selectedBatch ? snapshotAt(selectedBatch, selected.stepId) : undefined
  const selectedStep = state.processSteps.find((item) => item.id === selected?.stepId)
  const currentPublished = selected ? latestPublished(state.matrixVersions, selected.stepId) : undefined
  const versionMoved = currentPublished && selected ? currentPublished.version !== selected.stepVersion : false

  const createBatch = state.batches.find((item) => item.id === newDeviation.batchId)
  const createPinned = createBatch ? snapshotAt(createBatch, newDeviation.stepId) : undefined

  return (
    <section className="page">
      <header className="page-head"><div><p>关键限值偏离 / 调查与复核</p><h1>偏差处置工作台</h1></div><Button appearance="primary" onClick={() => setShowCreate(true)}>登记偏差</Button></header>
      <div className="toolbar"><Dropdown value={status} selectedOptions={[status]} onOptionSelect={(_, data) => setStatus(data.optionValue as typeof status)}>{['全部', '待调查', '调查中', '待复核', '已关闭'].map((item) => <Option key={item} value={item}>{item}</Option>)}</Dropdown><span>偏差锚定批次开工时的控制点版本；矩阵再发布也不会改写判定依据。</span></div>
      <div className="split-layout">
        <div className="deviation-list">{rows.map((item) => {
          const step = state.processSteps.find((entry) => entry.id === item.stepId)
          return <button key={item.id} className={item.id === selected?.id ? 'active' : ''} onClick={() => { setSelectedId(item.id); setInvestigation(null) }}>
            <div><Badge color={item.severity === '重大' ? 'danger' : 'warning'}>{item.severity}</Badge><small>{item.id}</small></div>
            <strong>{item.title}</strong>
            <span>{item.batchId} · {item.owner}</span>
            <footer><Badge appearance="tint">{item.status}</Badge><span>{step?.name ?? item.stepId} 开工V{item.stepVersion} · {item.dueDate} 截止</span></footer>
          </button>
        })}</div>
        {selected && <div className="record-panel">
          <div className="record-title"><div><span>{selected.id} · 记录V{selected.version}</span><h2>{selected.title}</h2></div><Badge color={selected.severity === '重大' ? 'danger' : 'warning'}>{selected.status}</Badge></div>

          <div className="version-card">
            <header><span>{selectedStep?.name ?? selected.stepId}（{selected.stepId}）</span><Badge appearance="tint" color="brand">偏差依据：开工版本 V{selected.stepVersion}</Badge></header>
            <dl>
              <div><dt>控制点</dt><dd>{selectedStep?.controlPoint ?? pinnedSnapshot?.controlPoint}</dd></div>
              <div><dt>当时关键限值</dt><dd className="changed">{pinnedSnapshot?.limit ?? '—'}</dd></div>
              <div><dt>当时监控频率</dt><dd>{pinnedSnapshot?.frequency ?? '—'}</dd></div>
              <div><dt>当时纠偏措施</dt><dd>{pinnedSnapshot?.correctiveAction ?? '—'}</dd></div>
            </dl>
            {versionMoved && currentPublished && <div className="version-compare">
              <p>该控制点已发布更新版本（当前 V{currentPublished.version}），本偏差仍以开工版本 V{selected.stepVersion} 追溯：</p>
              <div className="diff-grid">
                <div><dt>关键限值</dt><dd><s>{pinnedSnapshot?.limit}</s> <b>→</b> <span className="new-value">{currentPublished.limit}</span></dd></div>
                <div><dt>监控频率</dt><dd><s>{pinnedSnapshot?.frequency}</s> <b>→</b> <span className="new-value">{currentPublished.frequency}</span></dd></div>
                <div><dt>纠偏措施</dt><dd><s>{pinnedSnapshot?.correctiveAction}</s> <b>→</b> <span className="new-value">{currentPublished.correctiveAction}</span></dd></div>
              </div>
            </div>}
            {!versionMoved && <p className="muted-text">当前已发布版本仍为 V{selected.stepVersion}，与偏差依据一致。</p>}
          </div>

          <Field label="原因判断"><Textarea value={activeInvestigation?.cause ?? ''} onChange={(_, data) => setInvestigation({ ...(activeInvestigation ?? selected.investigation), cause: data.value })} /></Field>
          <Field label="证据摘要"><Textarea value={activeInvestigation?.evidence ?? ''} onChange={(_, data) => setInvestigation({ ...(activeInvestigation ?? selected.investigation), evidence: data.value })} /></Field>
          <Field label="处置分支"><Dropdown value={activeInvestigation?.decision} selectedOptions={[activeInvestigation?.decision ?? '返工']} onOptionSelect={(_, data) => setInvestigation({ ...(activeInvestigation ?? selected.investigation), decision: data.optionValue as DecisionType })}>{['返工', '报废', '让步接收'].map((item) => <Option key={item} value={item} text={item}>{item}</Option>)}</Dropdown></Field>
          <Field label="返工或报废指令"><Textarea value={activeInvestigation?.reworkInstruction ?? ''} onChange={(_, data) => setInvestigation({ ...(activeInvestigation ?? selected.investigation), reworkInstruction: data.value })} /></Field>
          <div className="record-actions">
            <Button disabled={!activeInvestigation?.cause || !activeInvestigation?.evidence} onClick={() => dispatch(saveInvestigation({ id: selected.id, investigation: activeInvestigation! }))}>提交调查</Button>
            <Button appearance="primary" disabled={selected.status !== '待复核'} onClick={() => dispatch(reviewDeviation({ id: selected.id, approved: true, note: '调查证据充分，纠偏措施可执行。', reviewer: '质量负责人 秦岚' }))}>复核通过</Button>
          </div>
          <Button appearance="subtle" disabled={selected.status !== '待复核'} onClick={() => dispatch(reviewDeviation({ id: selected.id, approved: false, note: '需补充设备故障诊断记录。', reviewer: '质量负责人 秦岚' }))}>退回补充证据</Button>
        </div>}
      </div>
      {showCreate && <div className="edit-panel">
        <h3>登记关键限值偏差</h3>
        <div className="edit-grid">
          <Field label="批次"><Dropdown value={newDeviation.batchId} selectedOptions={[newDeviation.batchId]} onOptionSelect={(_, data) => setNewDeviation({ ...newDeviation, batchId: data.optionValue ?? '' })}>{state.batches.map((item) => <Option key={item.id} value={item.id} text={`${item.id} ${item.product}`}>{item.id} {item.product}</Option>)}</Dropdown></Field>
          <Field label="控制点（将锚定该批次开工版本）"><Dropdown value={newDeviation.stepId} selectedOptions={[newDeviation.stepId]} onOptionSelect={(_, data) => setNewDeviation({ ...newDeviation, stepId: data.optionValue ?? '' })}>{state.processSteps.map((item) => {
            const snap = createBatch ? snapshotAt(createBatch, item.id) : undefined
            return <Option key={item.id} value={item.id} text={`${item.name}（开工V${snap?.version ?? '—'}）`}>{item.name}（开工V{snap?.version ?? '—'} · {snap?.limit ?? '—'}）</Option>
          })}</Dropdown></Field>
          <Field label="偏差标题"><Input value={newDeviation.title} onChange={(_, data) => setNewDeviation({ ...newDeviation, title: data.value })} /></Field>
        </div>
        <p className="pinned-note">判定依据：批次 {newDeviation.batchId} 的控制点 {newDeviation.stepId} 开工版本 V{createPinned?.version ?? '—'}（限值 {createPinned?.limit ?? '—'}），与控制矩阵当前最新版本无关。</p>
        <div className="record-actions"><Button onClick={() => setShowCreate(false)}>取消</Button><Button appearance="primary" disabled={!newDeviation.title || !newDeviation.batchId} onClick={() => { dispatch(createDeviation(newDeviation)); setShowCreate(false) }}>创建并隔离批次</Button></div>
      </div>}
    </section>
  )
}
