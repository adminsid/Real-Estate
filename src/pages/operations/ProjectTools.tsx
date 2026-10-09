import { MemberIdentity } from './MemberIdentity'
import { WorkspaceRecordPicker } from './WorkspaceRecordPicker'
import { useOperationsDialog } from './useOperationsDialog'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Download, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  buildProcedure,
  dateOnly,
  PROJECT_STAGES,
  STATUS_LABELS,
  TASK_STATUSES,
  taskBlocker,
  mlsTaskDueDate,
  type OperationsMember,
  type ProjectRecord,
  type ProjectTask,
  type ProjectStage,
} from '@/domain/operations'
import { downloadContentPlan } from './operations-api'

function localDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}

export function TaskDrawer({
  task,
  project,
  members,
  busy,
  onClose,
  onSave,
  onComment,
  onDelete,
  error,
}: {
  task: ProjectTask
  project: ProjectRecord
  members: OperationsMember[]
  busy: boolean
  onClose: () => void
  onSave: (task: ProjectTask) => Promise<boolean>
  onComment: (message: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  error: string
}) {
  const { user } = useAuth()
  const dialog = useOperationsDialog(onClose, busy)
  const [draft, setDraft] = useState(task),
    [comment, setComment] = useState(''),
    [localError, setLocalError] = useState('')
  const patch = (value: Partial<ProjectTask>) =>
    setDraft((current) => ({ ...current, ...value }))
  const canApprove =
    ['admin', 'broker'].includes(user?.role || '') ||
    draft.approverId === user?.id
  const blockers = project.tasks.filter((t) => t.blockedBy === task.id)
  const saved = project.tasks.some((t) => t.id === task.id)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setLocalError('')
    if (await onSave(draft)) setLocalError('')
    else
      setLocalError(
        'Changes were not saved. Review the message below and retry.',
      )
  }
  async function post() {
    if (!comment.trim()) return
    if (await onComment(comment.trim())) setComment('')
  }
  return (
    <div className="ops-overlay drawer">
      <section
        className="ops-drawer"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-title"
      >
        <div className="ops-section-heading">
          <div>
            <span className="ops-eyebrow">{draft.phase.toUpperCase()}</span>
            <h2 id="task-title">
              {saved ? 'Deliverable details' : 'New deliverable'}
            </h2>
          </div>
          <button
            aria-label="Close deliverable"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="ops-deliverable-summary">
          <MemberIdentity
            name={draft.owner}
            id={draft.ownerId}
            members={members}
          />
          <span className={`ops-pill status-${draft.status}`}>
            {STATUS_LABELS[draft.status]}
          </span>
          <span>{dateOnly(draft.dueDate) || 'Set a deadline'}</span>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={busy}>
            <label>
              Deliverable
              <input
                required
                maxLength={240}
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                autoFocus
              />
            </label>
            <div className="ops-form-grid">
              <label>
                Phase
                <select
                  value={draft.phase}
                  onChange={(e) =>
                    patch({ phase: e.target.value as ProjectStage })
                  }
                >
                  {PROJECT_STAGES.filter((s) => s !== 'Completed').map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Work status
                <select
                  value={draft.status}
                  onChange={(e) =>
                    patch({ status: e.target.value as ProjectTask['status'] })
                  }
                >
                  {TASK_STATUSES.filter(
                    (s) =>
                      s !== 'approved' ||
                      canApprove ||
                      draft.status === 'approved',
                  ).map((s) => (
                    <option value={s} key={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <select
                  value={draft.ownerId}
                  onChange={(e) => {
                    const member = members.find((m) => m.id === e.target.value)
                    patch({
                      ownerId: e.target.value,
                      owner: member?.name || '',
                    })
                  }}
                >
                  <option value="">
                    {draft.owner && !draft.ownerId
                      ? `${draft.owner} (assign a workspace user)`
                      : 'Unassigned'}
                  </option>
                  {members.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Creation deadline
                <input
                  type="date"
                  value={dateOnly(draft.dueDate)}
                  onChange={(e) => patch({ dueDate: e.target.value })}
                />
              </label>
            </div>
            <details className="ops-detail-group">
              <summary>Instructions</summary>
              <label>
                Instructions
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </label>
            </details>
            <details className="ops-detail-group">
              <summary>
                Dependencies & review
                {draft.requiresApproval ? ' · Approval required' : ''}
              </summary>
              <label>
                Waiting for
                <select
                  value={draft.blockedBy}
                  onChange={(e) => patch({ blockedBy: e.target.value })}
                >
                  <option value="">No dependency</option>
                  {project.tasks
                    .filter((t) => t.id !== draft.id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </label>
              {taskBlocker(draft, project.tasks) && (
                <p className="ops-warning">
                  Blocked by: {taskBlocker(draft, project.tasks)}
                </p>
              )}
              {blockers.length > 0 && (
                <p className="ops-hint">
                  {blockers.length} deliverable(s) depend on this task. Date
                  changes do not move their deadlines automatically.
                </p>
              )}
              <div className="ops-form-grid">
                <label className="ops-check">
                  <input
                    type="checkbox"
                    checked={draft.requiresApproval}
                    onChange={(e) =>
                      patch({ requiresApproval: e.target.checked })
                    }
                  />{' '}
                  Requires approval
                </label>
                <label>
                  Approver
                  <select
                    value={draft.approverId}
                    onChange={(e) => patch({ approverId: e.target.value })}
                  >
                    <option value="">Broker / admin</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {draft.approvedBy && (
                <p className="ops-success">
                  Approved by{' '}
                  {members.find((m) => m.id === draft.approvedBy)?.name ||
                    draft.approvedBy}
                  . Editing the content or attached assets requires another
                  review.
                </p>
              )}
            </details>
            <div className="ops-tool-links">
              <Link
                to={
                  project.listingId
                    ? `/inventory/listings/${project.listingId}`
                    : '/inventory'
                }
              >
                Open listing & media vault <ArrowUpRight size={14} />
              </Link>
              <Link to="/marketing/brand-marketing-hub">
                Create in Brand Hub <ArrowUpRight size={14} />
              </Link>
            </div>
            <details className="ops-detail-group">
              <summary>
                Files & links · {draft.assetIds.length} attached
              </summary>
              <p className="ops-hint">
                Add files or asset links in the project’s Assets tab, then
                select them here.
              </p>
              <div className="ops-asset-picker">
                {project.assets.map((asset) => (
                  <label key={asset.id} className="ops-check">
                    <input
                      type="checkbox"
                      checked={draft.assetIds.includes(asset.id)}
                      onChange={(e) =>
                        patch({
                          assetIds: e.target.checked
                            ? [...draft.assetIds, asset.id]
                            : draft.assetIds.filter((id) => id !== asset.id),
                        })
                      }
                    />
                    {asset.name}
                    <a href={asset.url} target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  </label>
                ))}
                {!project.assets.length && <small>No assets added yet.</small>}
              </div>
            </details>
            <details className="ops-detail-group ops-content-details">
              <summary>Content & publication plan</summary>
              <div className="ops-form-grid">
                <label>
                  Platform
                  <select
                    value={draft.platform}
                    onChange={(e) => patch({ platform: e.target.value })}
                  >
                    <option value="">Choose platform</option>
                    {[
                      'Instagram',
                      'Facebook',
                      'LinkedIn',
                      'YouTube',
                      'TikTok',
                      'MLS',
                      'Website',
                      'Email',
                    ].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Publication date
                  <input
                    type="date"
                    value={dateOnly(draft.publishDate)}
                    onChange={(e) => patch({ publishDate: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Caption / content
                <textarea
                  rows={5}
                  value={draft.caption}
                  maxLength={5000}
                  onChange={(e) => patch({ caption: e.target.value })}
                />
              </label>
              <label>
                Scheduling or published link
                <input
                  type="url"
                  placeholder="https://…"
                  value={draft.schedulerUrl}
                  onChange={(e) => patch({ schedulerUrl: e.target.value })}
                />
              </label>
              <label>
                Publication status
                <select
                  value={draft.publicationStatus}
                  onChange={(e) =>
                    patch({
                      publicationStatus: e.target
                        .value as ProjectTask['publicationStatus'],
                    })
                  }
                >
                  <option value="planned">Planned</option>
                  <option value="scheduled">
                    Scheduled in external platform
                  </option>
                  <option value="published">Published (confirmed)</option>
                </select>
              </label>
              <p className="ops-hint">
                Publication is tracked here. Schedule automatic posting in your
                social platform and save its link.
              </p>
            </details>
            {(localError || error) && (
              <div className="ops-error" role="alert">
                {error || localError}
              </div>
            )}
            <div className="ops-actions end">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="ops-primary">
                {busy ? 'Saving…' : 'Save deliverable'}
              </button>
            </div>
          </fieldset>
        </form>
        {saved && (
          <section className="ops-drawer-comments">
            <h3>Feedback & comments</h3>
            <div className="ops-comments">
              {project.comments
                .filter((c) => c.taskId === task.id)
                .map((c) => (
                  <article key={c.id}>
                    <div>
                      <MemberIdentity
                        name={c.author}
                        id={c.authorId}
                        members={members}
                      />
                      <small>{new Date(c.createdAt).toLocaleString()}</small>
                    </div>
                    <p>{c.message}</p>
                  </article>
                ))}
            </div>
            <label>
              Comment
              <textarea
                value={comment}
                maxLength={5000}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
              />
            </label>
            <button
              disabled={busy || !comment.trim()}
              onClick={() => void post()}
            >
              Post comment
            </button>
            <details className="ops-remove">
              <summary>Remove deliverable</summary>
              <p>
                Remove this deliverable from the plan. Comments stay in project
                history.
              </p>
              <button
                disabled={busy}
                className="ops-danger"
                onClick={() => void onDelete()}
              >
                Remove from project
              </button>
            </details>
          </section>
        )}
      </section>
    </div>
  )
}

export function ProjectSettings({
  members,
  project,
  busy,
  onClose,
  onSave,
  onProcedure,
  onDelete,
  error,
}: {
  project: ProjectRecord
  members: OperationsMember[]
  busy: boolean
  onClose: () => void
  onSave: (p: ProjectRecord) => Promise<boolean>
  onProcedure: (phase: ProjectStage, anchor: string) => Promise<boolean>
  onDelete: (confirmation: string) => Promise<boolean>
  error: string
}) {
  const [recordBusy, setRecordBusy] = useState(false)
  const dialog = useOperationsDialog(onClose, busy || recordBusy)
  const { user } = useAuth()
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [draft, setDraft] = useState(project),
    [phase, setPhase] = useState<ProjectStage>('Marketing'),
    [anchor, setAnchor] = useState(dateOnly(project.signedDate)),
    [notice, setNotice] = useState('')
  const patch = (value: Partial<ProjectRecord>) =>
    setDraft((p) => ({ ...p, ...value }))
  const workflow = (value: Partial<ProjectRecord['workflow']>) =>
    setDraft((p) => ({ ...p, workflow: { ...p.workflow, ...value } }))
  function choosePhase(value: ProjectStage) {
    setPhase(value)
    setAnchor(
      dateOnly(
        value === 'Marketing'
          ? project.signedDate
          : value === 'Under Contract'
            ? project.workflow.contractDate
            : project.workflow.closingDate,
      ),
    )
  }
  async function apply() {
    if (!anchor) return
    const count = buildProcedure(
      phase,
      anchor,
      project.owner,
      project.tasks,
      project.workflow.launchDate,
      project.workflow,
    ).length
    if (!count) {
      setNotice(
        'This procedure is already present. Existing work was preserved.',
      )
      return
    }
    if (await onProcedure(phase, anchor))
      setNotice(
        `${count} deliverables added. Close settings to review the plan.`,
      )
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    const next = { ...draft }
    const mlsDatesChanged =
      draft.signedDate !== project.signedDate ||
      ['mlsListingDate', 'mlsEnteredAt', 'clearCooperationDueDate'].some(
        (key) =>
          draft.workflow[key as keyof ProjectRecord['workflow']] !==
          project.workflow[key as keyof ProjectRecord['workflow']],
      )
    if (mlsDatesChanged)
      next.tasks = next.tasks.map((task) =>
        task.presetKey.startsWith('mls:v1:') && task.status !== 'done'
          ? {
              ...task,
              dueDate: mlsTaskDueDate(
                task.presetKey.slice('mls:v1:'.length),
                draft.signedDate,
                draft.workflow,
              ),
            }
          : task,
      )
    if (draft.workflow.launchDate !== project.workflow.launchDate) {
      next.tasks = next.tasks.map((t) =>
        t.presetKey.startsWith('content:') && t.publicationStatus === 'planned'
          ? {
              ...t,
              publishDate:
                buildProcedure(
                  'Marketing',
                  draft.signedDate,
                  draft.owner,
                  [],
                  draft.workflow.launchDate,
                ).find((x) => x.presetKey === t.presetKey)?.publishDate ||
                t.publishDate,
            }
          : t,
      )
    }
    await onSave(next)
  }
  return (
    <div className="ops-overlay">
      <section
        className="ops-modal"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="ops-section-heading">
          <h2 id="settings-title">Project settings</h2>
          <button
            disabled={busy || recordBusy}
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={busy || recordBusy}>
            <label>
              Project name
              <input
                required
                maxLength={200}
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <div className="ops-form-grid">
              <label>
                Project lead
                <input
                  maxLength={120}
                  value={draft.owner}
                  onChange={(e) => patch({ owner: e.target.value })}
                />
              </label>
              <label>
                Current phase
                <select
                  value={draft.currentStage}
                  onChange={(e) =>
                    patch({
                      currentStage: e.target.value as ProjectStage,
                      status:
                        e.target.value === 'Completed'
                          ? 'Complete'
                          : draft.status === 'Complete'
                            ? 'Active'
                            : draft.status,
                    })
                  }
                >
                  {PROJECT_STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Project status
                <select
                  value={draft.status}
                  onChange={(e) =>
                    patch({ status: e.target.value as ProjectRecord['status'] })
                  }
                >
                  {['Active', 'Paused', 'Delayed', 'Complete'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Project result
                <select
                  value={draft.workflow.result}
                  onChange={(e) =>
                    workflow({
                      result: e.target
                        .value as ProjectRecord['workflow']['result'],
                    })
                  }
                >
                  <option value="">Still in progress</option>
                  {['sold', 'leased', 'withdrawn', 'expired', 'cancelled'].map(
                    (s) => (
                      <option value={s} key={s}>
                        {s[0].toUpperCase() + s.slice(1)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Agreement signed
                <input
                  type="date"
                  value={dateOnly(draft.signedDate)}
                  onChange={(e) => patch({ signedDate: e.target.value })}
                />
              </label>
              <label>
                Project target date
                <input
                  type="date"
                  value={dateOnly(draft.dueDate)}
                  onChange={(e) => patch({ dueDate: e.target.value })}
                />
              </label>
              <label>
                Target launch
                <input
                  type="date"
                  value={dateOnly(draft.workflow.launchDate)}
                  onChange={(e) => workflow({ launchDate: e.target.value })}
                />
              </label>
              <label>
                Under contract
                <input
                  type="date"
                  value={dateOnly(draft.workflow.contractDate)}
                  onChange={(e) => workflow({ contractDate: e.target.value })}
                />
              </label>
              <label>
                Closing date
                <input
                  type="date"
                  value={dateOnly(draft.workflow.closingDate)}
                  onChange={(e) => workflow({ closingDate: e.target.value })}
                />
              </label>
            </div>
            <p className="ops-hint">
              Changing launch date updates planned preset posts. Scheduled or
              published posts and custom work keep their dates. Contract and
              closing targets require verified business evidence.
            </p>
            <label>
              Agreement reference
              <input
                maxLength={500}
                value={draft.workflow.agreementReference}
                onChange={(e) =>
                  workflow({ agreementReference: e.target.value })
                }
              />
            </label>
            <details>
              <summary>MLS dates & deadlines</summary>
              <p className="ops-hint">
                Rule 302 uses the Listing Date, not the marketing launch date.
                Changing these dates updates open MLS deliverable deadlines.
              </p>
              <div className="ops-form-grid">
                <label>
                  MLS Listing Date
                  <input
                    type="date"
                    value={
                      draft.workflow.mlsListingDate ||
                      dateOnly(draft.signedDate)
                    }
                    onChange={(e) =>
                      workflow({ mlsListingDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Retained original Listing Date
                  <input
                    type="date"
                    value={draft.workflow.originalListingDate || ''}
                    onChange={(e) =>
                      workflow({ originalListingDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Confirmed Clear Cooperation deadline
                  <input
                    type="date"
                    value={draft.workflow.clearCooperationDueDate || ''}
                    onChange={(e) =>
                      workflow({ clearCooperationDueDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  MLS entered at (your local time)
                  <input
                    type="datetime-local"
                    value={localDateTime(draft.workflow.mlsEnteredAt || '')}
                    onChange={(e) =>
                      workflow({
                        mlsEnteredAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : '',
                      })
                    }
                  />
                </label>
              </div>
              <p className="ops-hint">
                Confirm the business-day deadline with the broker when public
                marketing starts. Attach evidence for original-date retention or
                the withdrawn/cancelled 60-day exception to the MLS deliverable.
              </p>
            </details>
            <details className="ops-detail-group">
              <summary>Linked workspace records</summary>
              <p className="ops-hint">
                Search existing records first. Select a match or create one,
                then save settings.
              </p>
              <WorkspaceRecordPicker
                kind="contact"
                value={draft.crmContactId}
                onChange={(crmContactId) => patch({ crmContactId })}
                address={draft.propertyAddress}
                clientName={draft.clientName}
                onBusy={setRecordBusy}
              />
              <WorkspaceRecordPicker
                kind="listing"
                value={draft.listingId}
                onChange={(listingId) => patch({ listingId })}
                address={draft.propertyAddress}
                clientName={draft.clientName}
                onBusy={setRecordBusy}
              />
              <WorkspaceRecordPicker
                kind="deal"
                value={draft.dealId}
                onChange={(dealId) => patch({ dealId })}
                address={draft.propertyAddress}
                clientName={draft.clientName}
                onBusy={setRecordBusy}
              />
            </details>
            <details className="ops-detail-group">
              <summary>
                Project collaborators ·{' '}
                {draft.workflow.collaboratorIds?.length || 0}
              </summary>
              <p className="ops-hint">
                Choose the people working on this project. Deliverables keep
                their own assignees.
              </p>
              <div className="ops-team-picker">
                {members.map((member) => (
                  <label key={member.id} className="ops-check">
                    <input
                      type="checkbox"
                      checked={
                        draft.workflow.collaboratorIds?.includes(member.id) ||
                        false
                      }
                      onChange={(e) =>
                        workflow({
                          collaboratorIds: e.target.checked
                            ? [
                                ...(draft.workflow.collaboratorIds || []),
                                member.id,
                              ]
                            : (draft.workflow.collaboratorIds || []).filter(
                                (id) => id !== member.id,
                              ),
                        })
                      }
                    />
                    <MemberIdentity
                      name={member.name}
                      id={member.id}
                      members={members}
                    />
                  </label>
                ))}
              </div>
            </details>
            {error && (
              <div className="ops-error" role="alert">
                {error}
              </div>
            )}
            <div className="ops-actions end">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="ops-primary">
                Save settings
              </button>
            </div>
          </fieldset>
        </form>
        <section className="ops-procedure">
          <h3>Preset policies & procedures</h3>
          <p className="ops-hint">
            Save settings first, then add a procedure. Each project keeps an
            editable copy. Suggested dates are internal targets; use actual
            contract deadlines.
          </p>
          <div className="ops-form-grid">
            <label>
              Procedure
              <select
                value={phase}
                onChange={(e) => choosePhase(e.target.value as ProjectStage)}
              >
                {['Marketing', 'Under Contract', 'Closed'].map((s) => (
                  <option key={s} value={s}>
                    {s === 'Closed' ? 'Closing preparation & follow-up' : s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {phase === 'Closed'
                ? 'Closing date'
                : phase === 'Under Contract'
                  ? 'Contract date'
                  : 'Signed date'}
              <input
                type="date"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
              />
            </label>
          </div>
          <div className="ops-actions">
            <button
              disabled={busy || recordBusy || !anchor}
              onClick={() => void apply()}
            >
              Add missing deliverables
            </button>
            <button onClick={() => downloadContentPlan(project)}>
              <Download size={14} /> Export content plan
            </button>
          </div>
          {notice && (
            <p className="ops-success" role="status">
              {notice}
            </p>
          )}
        </section>
        {['admin', 'broker'].includes(user?.role || '') && (
          <details className="ops-remove">
            <summary>Delete project</summary>
            <p>
              Permanently delete this project, its deliverables and comments.
              Linked listing, CRM and deal records remain.
            </p>
            <label>
              Type delete to confirm
              <input
                autoComplete="off"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="ops-danger"
              disabled={busy || recordBusy || deleteConfirmation !== 'delete'}
              onClick={() => void onDelete(deleteConfirmation)}
            >
              Delete project permanently
            </button>
          </details>
        )}
      </section>
    </div>
  )
}
