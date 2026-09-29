import { useState } from 'react'
import {
  Badge, Button, Field, Input, MessageBar, MessageBarBody, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Tab, TabList, Textarea
} from '@fluentui/react-components'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { discardDraft, publishDraft, setDraftReason, updateDraftStep } from '../store/haccpSlice'
import { diffSteps, findVersion, latestVersion, MATRIX_FIELD_LABELS } from '../services/matrix'
import type { MatrixVersion, ProcessStep } from '../types'

const PUBLISHER = '质量负责人 秦岚'

function StepsTable({ steps, editable, onEdit }: { steps: ProcessStep[]; editable: boolean; onEdit?: (step: ProcessStep) => void }) {
  return (
    <Table size="small">
      <TableHeader>
        <TableRow>
          <TableHeaderCell>步骤</TableHeaderCell><TableHeaderCell>潜在危害</TableHeaderCell><TableHeaderCell>控制点</TableHeaderCell>
          <TableHeaderCell>关键限值</TableHeaderCell><TableHeaderCell>监控频率</TableHeaderCell><TableHeaderCell>纠偏措施</TableHeaderCell>
          {editable && <TableHeaderCell />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {steps.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.name}</TableCell><TableCell>{item.hazard}</TableCell><TableCell>{item.controlPoint}</TableCell>
            <TableCell><strong>{item.limit}</strong></TableCell><TableCell>{item.frequency}</TableCell><TableCell>{item.correctiveAction}</TableCell>
            {editable && <TableCell><Button size="small" appearance="subtle" onClick={() => onEdit?.(structuredClone(item))}>编辑</Button></TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function StepEditor({ step, onCancel, onSave }: { step: ProcessStep; onCancel: () => void; onSave: (step: ProcessStep) => void }) {
  const [draft, setDraft] = useState<ProcessStep>(step)
  return (
    <div className="edit-panel">
      <h3>{draft.name} · 草稿参数（保存后仅写入草稿，不影响在产批次）</h3>
      <div className="edit-grid">
        <Field label="关键限值"><Input value={draft.limit} onChange={(_, data) => setDraft({ ...draft, limit: data.value })} /></Field>
        <Field label="监控频率"><Input value={draft.frequency} onChange={(_, data) => setDraft({ ...draft, frequency: data.value })} /></Field>
        <Field label="纠偏措施"><Input value={draft.correctiveAction} onChange={(_, data) => setDraft({ ...draft, correctiveAction: data.value })} /></Field>
      </div>
      <div className="record-actions">
        <Button onClick={onCancel}>取消</Button>
        <Button appearance="primary" disabled={!draft.limit.trim() || !draft.frequency.trim() || !draft.correctiveAction.trim()} onClick={() => onSave(draft)}>保存到草稿</Button>
      </div>
    </div>
  )
}

function DraftTab() {
  const dispatch = useDispatch<AppDispatch>()
  const { matrixVersions, draftSteps, draftReason } = useSelector((root: RootState) => root.haccp)
  const current = latestVersion(matrixVersions)
  const changes = diffSteps(current.steps, draftSteps)
  const [editing, setEditing] = useState<ProcessStep | null>(null)
  const dirty = changes.length > 0

  return (
    <>
      <div className="version-banner">
        <div>
          <Badge appearance="outline" color="brand">草稿</Badge>
          <strong>基于已发布 V{current.version} 编辑</strong>
          <span>草稿修改不会改写已开工或隔离批次；发布后生成只读的 V{current.version + 1}，仅新开工批次采用。</span>
        </div>
        <Badge appearance="tint" color={dirty ? 'important' : 'success'}>{dirty ? `${changes.length} 处待发布变更` : '与已发布版本一致'}</Badge>
      </div>

      <div className="table-panel">
        <StepsTable steps={draftSteps} editable onEdit={setEditing} />
      </div>

      {editing && <StepEditor key={editing.id} step={editing} onCancel={() => setEditing(null)} onSave={(step) => { dispatch(updateDraftStep(step)); setEditing(null) }} />}

      {dirty && (
        <div className="change-panel">
          <h3>待发布变更（变更前 → 变更后）</h3>
          <ul className="change-list">
            {changes.map((change) => (
              <li key={`${change.stepId}-${change.field}`}>
                <Badge size="small" appearance="tint">{change.stepName}</Badge>
                <span>{MATRIX_FIELD_LABELS[change.field]}</span>
                <del>{change.before}</del>
                <b>→</b>
                <strong>{change.after}</strong>
              </li>
            ))}
          </ul>
          <Field label="变更原因（发布必填，将随版本永久留痕）" required>
            <Textarea rows={2} value={draftReason} onChange={(_, data) => dispatch(setDraftReason(data.value))} placeholder="例如：依据杀菌工艺再验证报告，将温度限值由72℃调整为……" />
          </Field>
          <div className="record-actions">
            <Button onClick={() => { dispatch(discardDraft()); setEditing(null) }}>放弃草稿</Button>
            <Button
              appearance="primary"
              disabled={!draftReason.trim()}
              onClick={() => { dispatch(publishDraft({ reason: draftReason, publishedBy: PUBLISHER })); setEditing(null) }}
            >
              填写原因并发布 V{current.version + 1}
            </Button>
          </div>
          {!draftReason.trim() && <p className="hint-text">未填写变更原因前不能发布。</p>}
        </div>
      )}
      {!dirty && (
        <MessageBar intent="info">
          <MessageBarBody>草稿与当前已发布 V{current.version} 完全一致。编辑任一控制点的关键限值、频率或纠偏措施后，即可填写变更原因并发布新版本。</MessageBarBody>
        </MessageBar>
      )}
    </>
  )
}

function VersionDetail({ version, allVersions, currentVersionNumber }: { version: MatrixVersion; allVersions: MatrixVersion[]; currentVersionNumber: number }) {
  const base = version.basedOnVersion === null ? null : findVersion(allVersions, version.basedOnVersion)
  const changes = base ? diffSteps(base.steps, version.steps) : []
  const isCurrent = version.version === currentVersionNumber
  return (
    <div className="record-panel version-detail">
      <div className="record-title">
        <div><span>{version.publishedAt.replace('T', ' ').slice(0, 16)} · {version.publishedBy}</span><h2>控制矩阵 V{version.version}{isCurrent && <> <Badge appearance="tint" color="success">当前版本</Badge></>}</h2></div>
        <Badge appearance="outline">{version.basedOnVersion === null ? '首版' : `基于 V${version.basedOnVersion}`}</Badge>
      </div>
      <dl><div><dt>变更原因</dt><dd>{version.reason}</dd></div></dl>
      {changes.length > 0 && (
        <>
          <h3>本版变更前后限值</h3>
          <ul className="change-list">
            {changes.map((change) => (
              <li key={`${change.stepId}-${change.field}`}>
                <Badge size="small" appearance="tint">{change.stepName}</Badge>
                <span>{MATRIX_FIELD_LABELS[change.field]}</span>
                <del>{change.before}</del><b>→</b><strong>{change.after}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>矩阵限值快照（只读）</h3>
      <StepsTable steps={version.steps} editable={false} />
    </div>
  )
}

function PublishedTab() {
  const matrixVersions = useSelector((root: RootState) => root.haccp.matrixVersions)
  const current = latestVersion(matrixVersions)
  const [selectedVersion, setSelectedVersion] = useState(current.version)
  const selected = findVersion(matrixVersions, selectedVersion) ?? current

  return (
    <div className="split-layout version-layout">
      <div className="version-list">
        {[...matrixVersions].reverse().map((item) => (
          <button key={item.version} className={item.version === selected.version ? 'active' : ''} onClick={() => setSelectedVersion(item.version)}>
            <div><strong>V{item.version}</strong>{item.version === current.version ? <Badge appearance="tint" color="success">当前</Badge> : <Badge appearance="outline">只读</Badge>}</div>
            <span>{item.basedOnVersion === null ? '首版发布' : `基于 V${item.basedOnVersion} 发布`}</span>
            <small>{item.publishedAt.replace('T', ' ').slice(0, 16)} · {item.publishedBy}</small>
            <small className="clamp">{item.reason}</small>
          </button>
        ))}
      </div>
      <VersionDetail version={selected} allVersions={matrixVersions} currentVersionNumber={current.version} />
    </div>
  )
}

export function ProcessControl() {
  const matrixVersions = useSelector((root: RootState) => root.haccp.matrixVersions)
  const draftSteps = useSelector((root: RootState) => root.haccp.draftSteps)
  const current = latestVersion(matrixVersions)
  const [tab, setTab] = useState<string>('draft')
  const flowSteps = tab === 'published' ? current.steps : tab === 'draft' ? draftSteps : current.steps

  return (
    <section className="page">
      <header className="page-head">
        <div><p>危害分析 / 关键控制点</p><h1>HACCP控制矩阵</h1></div>
        <div className="head-versions"><Badge appearance="tint" color="success">已发布 V{current.version}</Badge><Badge appearance="outline" color="brand">草稿基于 V{current.version}</Badge></div>
      </header>
      <div className="process-flow">{flowSteps.map((stepItem, index) => <div key={stepItem.id}><b>{index + 1}</b><span>{stepItem.name}</span><small>{stepItem.limit}</small></div>)}</div>
      <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(data.value as string)}>
        <Tab value="draft">草稿（编辑与发布）</Tab>
        <Tab value="published">已发布版本（只读追溯）</Tab>
      </TabList>
      <div className="tab-body">
        {tab === 'draft' ? <DraftTab /> : <PublishedTab />}
      </div>
      <div className="rule-band"><strong>版本约束</strong><span>编辑先留在草稿；填写变更原因发布后才生成只读新版本并仅对新开工批次生效。已开工批次、相关偏差与审计记录继续指向开工版本，旧版本不可修改。</span></div>
    </section>
  )
}
