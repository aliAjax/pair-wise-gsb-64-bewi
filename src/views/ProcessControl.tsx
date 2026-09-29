import { useState } from 'react'
import { Badge, Button, Field, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Textarea } from '@fluentui/react-components'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { discardMatrixDraft, publishMatrixVersion, saveMatrixDraft } from '../store/haccpSlice'
import { diffParameters, draftDiffers, latestPublished, publishedVersion, versionsOf } from '../services/matrix'
import type { ProcessStep, StepParameters } from '../types'

const fmt = (iso: string) => iso.replace('T', ' ').slice(0, 16)

interface EditState {
  stepId: string
  form: StepParameters
  reason: string
  saved: boolean
}

export function ProcessControl() {
  const dispatch = useDispatch<AppDispatch>()
  const steps = useSelector((root: RootState) => root.haccp.processSteps)
  const versions = useSelector((root: RootState) => root.haccp.matrixVersions)
  const drafts = useSelector((root: RootState) => root.haccp.matrixDrafts)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [historyStepId, setHistoryStepId] = useState<string | null>(null)

  const draftCount = steps.filter((step) => draftDiffers(drafts[step.id], versions, step.id)).length
  const historyStep = steps.find((step) => step.id === historyStepId) ?? null

  const openEditor = (step: ProcessStep) => {
    setHistoryStepId(null)
    const current = latestPublished(versions, step.id)
    const draft = drafts[step.id]
    const base = draft ?? (current ? { limit: current.limit, frequency: current.frequency, correctiveAction: current.correctiveAction } : { limit: '', frequency: '', correctiveAction: '' })
    setEditing({ stepId: step.id, form: { ...base }, reason: '', saved: Boolean(draft) })
  }

  const updateForm = (patch: Partial<StepParameters>) => {
    if (!editing) return
    setEditing({ ...editing, form: { ...editing.form, ...patch }, saved: false })
  }

  const saveDraft = () => {
    if (!editing) return
    dispatch(saveMatrixDraft({ stepId: editing.stepId, parameters: editing.form }))
    setEditing({ ...editing, saved: true })
  }

  const publish = () => {
    if (!editing || !editing.reason.trim()) return
    dispatch(publishMatrixVersion({ stepId: editing.stepId, parameters: editing.form, changeReason: editing.reason }))
    setEditing(null)
  }

  const editingStep = editing ? steps.find((step) => step.id === editing.stepId) : null
  const editingBase = editing ? latestPublished(versions, editing.stepId) : undefined
  const formChanged = editing
    ? !editingBase ||
      editing.form.limit !== editingBase.limit ||
      editing.form.frequency !== editingBase.frequency ||
      editing.form.correctiveAction !== editingBase.correctiveAction
    : false
  const formValid = Boolean(editing?.form.limit.trim() && editing.form.frequency.trim() && editing.form.correctiveAction.trim())

  return (
    <section className="page">
      <header className="page-head">
        <div><p>危害分析 / 关键控制点</p><h1>HACCP控制矩阵</h1></div>
        <Badge appearance="tint" color={draftCount > 0 ? 'important' : 'success'}>{draftCount > 0 ? `${draftCount} 个控制点有未发布草稿` : '草稿区为空，全部为已发布版本'}</Badge>
      </header>
      <div className="process-flow">{steps.map((step, index) => <div key={step.id}><b>{index + 1}</b><span>{step.name}</span><small>{step.equipment}</small></div>)}</div>
      <div className="table-panel">
        <Table size="small">
          <TableHeader><TableRow>
            <TableHeaderCell>步骤</TableHeaderCell><TableHeaderCell>潜在危害</TableHeaderCell><TableHeaderCell>控制点</TableHeaderCell>
            <TableHeaderCell>已发布关键限值</TableHeaderCell><TableHeaderCell>监控频率</TableHeaderCell><TableHeaderCell>草稿</TableHeaderCell><TableHeaderCell>操作</TableHeaderCell>
          </TableRow></TableHeader>
          <TableBody>{steps.map((step) => {
            const current = latestPublished(versions, step.id)
            const draft = drafts[step.id]
            const pending = draftDiffers(draft, versions, step.id)
            return <TableRow key={step.id}>
              <TableCell>{step.name}</TableCell>
              <TableCell>{step.hazard}</TableCell>
              <TableCell>{step.controlPoint}</TableCell>
              <TableCell>
                <strong>{current?.limit ?? '—'}</strong>
                <div><Badge appearance="tint" color="informative">现行 V{current?.version ?? '—'}</Badge></div>
                {pending && draft && <small className="draft-line">草稿待发布：{draft.limit}</small>}
              </TableCell>
              <TableCell>{current?.frequency ?? '—'}</TableCell>
              <TableCell>{pending
                ? <Badge appearance="tint" color="important">草稿待发布</Badge>
                : <span className="muted-text">无</span>}</TableCell>
              <TableCell>
                <Button size="small" appearance="subtle" onClick={() => openEditor(step)}>编辑草稿</Button>
                <Button size="small" appearance="subtle" onClick={() => { setEditing(null); setHistoryStepId(step.id) }}>版本历史</Button>
              </TableCell>
            </TableRow>
          })}</TableBody>
        </Table>
      </div>

      {editing && editingStep && <div className="edit-panel">
        <h3>{editingStep.name} · 控制参数{editingBase && <span className="base-version">基于已发布 V{editingBase.version} 编辑</span>}</h3>
        <div className="edit-grid">
          <Field label="关键限值"><Input value={editing.form.limit} onChange={(_, data) => updateForm({ limit: data.value })} /></Field>
          <Field label="监控频率"><Input value={editing.form.frequency} onChange={(_, data) => updateForm({ frequency: data.value })} /></Field>
          <Field label="纠偏措施"><Input value={editing.form.correctiveAction} onChange={(_, data) => updateForm({ correctiveAction: data.value })} /></Field>
        </div>
        <div className="version-diff">
          <span>变更前后对照（基于 V{editingBase?.version ?? '—'}）</span>
          <div className="diff-grid">
            <div><dt>关键限值</dt><dd className={formChanged && editing.form.limit !== editingBase?.limit ? 'changed' : ''}>{editingBase?.limit ?? '—'}<b> →</b><br />{editing.form.limit || '（空）'}</dd></div>
            <div><dt>监控频率</dt><dd className={editing.form.frequency !== editingBase?.frequency ? 'changed' : ''}>{editingBase?.frequency ?? '—'}<b> →</b><br />{editing.form.frequency || '（空）'}</dd></div>
            <div><dt>纠偏措施</dt><dd className={editing.form.correctiveAction !== editingBase?.correctiveAction ? 'changed' : ''}>{editingBase?.correctiveAction ?? '—'}<b> →</b><br />{editing.form.correctiveAction || '（空）'}</dd></div>
          </div>
        </div>
        <Field label="变更原因（发布必填，发布后新版本仅对新开工批次生效）" hint="已开工批次、相关偏差与审计记录继续指向各自的开工版本">
          <Textarea value={editing.reason} placeholder="例如：依据最新杀菌验证报告提高温度限值……" onChange={(_, data) => setEditing({ ...editing, reason: data.value })} />
        </Field>
        {editing.saved && <p className="ok-text">草稿已保存到草稿区，尚未发布，不影响任何已开工或隔离批次。</p>}
        {!formChanged && <p className="validation-text">参数与已发布 V{editingBase?.version} 完全一致，没有可发布的变更；如需重新发布请先修改限值、频率或纠偏措施。</p>}
        <div className="record-actions">
          {drafts[editing.stepId] && <Button onClick={() => { dispatch(discardMatrixDraft(editing.stepId)); setEditing(null) }}>放弃草稿</Button>}
          <Button onClick={() => setEditing(null)}>取消</Button>
          <Button appearance="secondary" disabled={!formValid} onClick={saveDraft}>保存草稿</Button>
          <Button appearance="primary" disabled={!formValid || !formChanged || !editing.reason.trim()} onClick={publish}>填写原因并发布新版本</Button>
        </div>
      </div>}

      {historyStep && <div className="edit-panel history-panel">
        <div className="history-head">
          <h3>{historyStep.name} · 版本历史（旧版本只读）</h3>
          <Button appearance="subtle" onClick={() => setHistoryStepId(null)}>关闭</Button>
        </div>
        <div className="version-list">{versionsOf(versions, historyStep.id).map((item) => {
          const parent = item.basedOnVersion !== null ? publishedVersion(versions, item.stepId, item.basedOnVersion) : undefined
          const changed = parent ? diffParameters(parent, item) : []
          return <article key={`${item.stepId}-${item.version}`} className={parent ? '' : 'first-version'}>
            <header>
              <Badge appearance="tint" color={parent ? 'brand' : 'success'}>V{item.version}</Badge>
              <span>{item.basedOnVersion !== null ? `基于上一版 V${item.basedOnVersion}` : '首版发布（无上一版）'}</span>
              <small>{item.publishedBy} · {fmt(item.publishedAt)}</small>
            </header>
            <dl className="version-params">
              <div><dt>关键限值</dt><dd className={changed.includes('limit') ? 'changed' : ''}>{parent && changed.includes('limit') ? <><s>{parent.limit}</s> <b>→</b> {item.limit}</> : item.limit}</dd></div>
              <div><dt>监控频率</dt><dd className={changed.includes('frequency') ? 'changed' : ''}>{parent && changed.includes('frequency') ? <><s>{parent.frequency}</s> <b>→</b> {item.frequency}</> : item.frequency}</dd></div>
              <div><dt>纠偏措施</dt><dd className={changed.includes('correctiveAction') ? 'changed' : ''}>{parent && changed.includes('correctiveAction') ? <><s>{parent.correctiveAction}</s> <b>→</b> {item.correctiveAction}</> : item.correctiveAction}</dd></div>
            </dl>
            <p className="reason-text">变更原因：{item.changeReason}</p>
          </article>
        })}</div>
        <p className="muted-text">旧版本为只读归档，详情中显示版本号与变更前后限值；已开工批次终身引用其开工时的版本，不会被新版本改写。</p>
      </div>}

      <div className="rule-band"><strong>控制矩阵版本约束</strong><span>编辑先保存在草稿区；填写变更原因发布后生成只读新版本并自动标明“基于上一版”，新版本只对之后开工的批次生效。</span></div>
    </section>
  )
}
