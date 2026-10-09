import { MemberIdentity } from './MemberIdentity'
import { AssetsPanel } from './AssetsPanel'
import { NewProjectModal } from './NewProjectModal'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Plus,
  Search,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { useAuth } from '@/context/AuthContext'
import {
  buildProcedure,
  buildMlsChecklist,
  dateOnly,
  isOverdue,
  newTask,
  PROJECT_STAGES,
  projectCompletion,
  STATUS_LABELS,
  taskBlocker,
  type OperationsMember,
  type ProjectRecord,
  type ProjectStage,
  type ProjectTask,
} from '@/domain/operations'
import {
  downloadContentPlan,
  deleteProject,
  loadMembers,
  loadProject,
  loadProjects,
  saveProject,
} from './operations-api'
import { OperationsCalendar } from './OperationsCalendar'
import { TaskDrawer, ProjectSettings } from './ProjectTools'
import { MlsRequirementsPanel } from './MlsRequirementsPanel'
import { toDateKey, type OperationCalendarEvent } from './operations-calendar'
import './operations.css'

function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
  return error ? (
    <div className="ops-error" role="alert">
      <span>{error}</span>
      {retry && <button onClick={retry}>Reload latest</button>}
    </div>
  ) : null
}
function Progress({ project }: { project: ProjectRecord }) {
  const percent = projectCompletion(project)
  return (
    <div className="ops-progress">
      <div>
        <i style={{ width: `${percent}%` }} />
      </div>
      <span>{percent}%</span>
    </div>
  )
}
export function OperationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false),
    [filter, setFilter] = useState('active'),
    [query, setQuery] = useState(''),
    [view, setView] = useState<'projects' | 'mine' | 'review'>('projects')
  const reload = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      setProjects(await loadProjects())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  const today = toDateKey(new Date())
  const active = projects.filter(
    (p) => !['Complete', 'Paused'].includes(p.status),
  )
  const openTasks = active.flatMap((project) =>
    project.tasks
      .filter((t) => t.status !== 'done')
      .map((task) => ({ project, task })),
  )
  const overdue = openTasks.filter(({ task }) => isOverdue(task, today))
  const reviews = openTasks.filter(({ task }) => task.status === 'in_review')
  const mine = openTasks
    .filter(
      ({ task }) =>
        task.ownerId === user?.id ||
        (!task.ownerId && task.owner === user?.name),
    )
    .sort((a, b) =>
      (a.task.dueDate || '9999').localeCompare(b.task.dueDate || '9999'),
    )
  const visible = projects.filter(
    (p) =>
      (filter === 'all' ||
        (filter === 'active'
          ? p.status !== 'Complete'
          : p.currentStage === filter)) &&
      `${p.name} ${p.clientName} ${p.propertyAddress}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  return (
    <Layout title="Operations">
      <div className="ops">
        <header className="ops-actions end">
          <button className="ops-primary" onClick={() => setShowNew(true)}>
            <Plus size={17} /> New project
          </button>
        </header>
        <ErrorNotice error={error} retry={() => void reload()} />
        <div className="ops-metrics">
          <div>
            <ClipboardList />
            <strong>{active.length}</strong>
            <span>Active projects</span>
          </div>
          <div>
            <Clock3 />
            <strong>{overdue.length}</strong>
            <span>Overdue deliverables</span>
          </div>
          <div>
            <CheckCircle2 />
            <strong>{reviews.length}</strong>
            <span>Waiting for review</span>
          </div>
          <div>
            <CalendarDays />
            <strong>
              {mine.filter((x) => dateOnly(x.task.dueDate) === today).length}
            </strong>
            <span>My work due today</span>
          </div>
        </div>
        <section className="ops-panel">
          <div className="ops-section-heading">
            <div className="ops-tabs inline">
              <button
                className={view === 'projects' ? 'active' : ''}
                onClick={() => setView('projects')}
              >
                All projects
              </button>
              <button
                className={view === 'mine' ? 'active' : ''}
                onClick={() => setView('mine')}
              >
                My work <small>{mine.length}</small>
              </button>
              <button
                className={view === 'review' ? 'active' : ''}
                onClick={() => setView('review')}
              >
                Review queue <small>{reviews.length}</small>
              </button>
            </div>
            {view === 'projects' && (
              <div className="ops-actions">
                <label className="ops-search">
                  <Search size={16} />
                  <input
                    aria-label="Search projects"
                    placeholder="Search address or client"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter projects"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="active">Active projects</option>
                  <option value="all">All projects</option>
                  {PROJECT_STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {loading ? (
            <p className="ops-empty">Loading projects…</p>
          ) : view === 'projects' ? (
            <div className="ops-project-grid">
              {visible.map((project) => {
                const blockers = project.tasks.filter((t) =>
                  taskBlocker(t, project.tasks),
                ).length
                const late = project.tasks.filter((t) =>
                  isOverdue(t, today),
                ).length
                const next = project.tasks
                  .filter((t) => t.status !== 'done')
                  .sort((a, b) =>
                    (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
                  )[0]
                return (
                  <Link
                    key={project.id}
                    className="ops-project-card"
                    to={`/operations/projects/${project.id}`}
                  >
                    <div className="ops-card-top">
                      <span className="ops-pill">{project.currentStage}</span>
                      <ArrowUpRight size={18} />
                    </div>
                    <h2>{project.propertyAddress || project.name}</h2>
                    <p>
                      {project.clientName || 'Client not linked'} ·{' '}
                      {project.owner || 'Unassigned lead'}
                    </p>
                    <Progress project={project} />
                    <div className="ops-card-next">
                      <small>NEXT DELIVERABLE</small>
                      <strong>
                        {next?.title || 'All deliverables complete'}
                      </strong>
                      <span>
                        {next?.dueDate
                          ? dateOnly(next.dueDate)
                          : 'No deadline set'}
                      </span>
                    </div>
                    <div className="ops-card-footer">
                      <span>{project.status}</span>
                      {late > 0 && (
                        <span className="ops-danger">{late} overdue</span>
                      )}
                      {blockers > 0 && <span>{blockers} blocked</span>}
                    </div>
                  </Link>
                )
              })}
              {!visible.length && (
                <div className="ops-empty">
                  <ClipboardList size={28} />
                  <h2>Your team’s next project starts here.</h2>
                  <p>
                    Create a project from a signed agreement and get a
                    ready-to-edit launch plan.
                  </p>
                  <button onClick={() => setShowNew(true)}>
                    Create project
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="ops-task-list">
              {(view === 'mine' ? mine : reviews).map(({ task, project }) => (
                <button
                  className="ops-work-row"
                  key={`${project.id}-${task.id}`}
                  onClick={() =>
                    navigate(
                      `/operations/projects/${project.id}?task=${task.id}`,
                    )
                  }
                >
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {project.name} · {task.owner || 'Unassigned'}
                    </small>
                  </div>
                  <span
                    className={`ops-pill ${isOverdue(task, today) ? 'late' : ''}`}
                  >
                    {task.dueDate ? dateOnly(task.dueDate) : 'No deadline'}
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
              {!(view === 'mine' ? mine : reviews).length && (
                <p className="ops-empty">
                  {view === 'mine'
                    ? 'No open tasks assigned to you. Assign owners inside a project.'
                    : 'No deliverables awaiting review.'}
                </p>
              )}
            </div>
          )}
        </section>
        {showNew && (
          <NewProjectModal
            onClose={() => setShowNew(false)}
            onCreated={(project) =>
              navigate(`/operations/projects/${project.id}`)
            }
            defaultOwner={user?.name || ''}
          />
        )}
      </div>
    </Layout>
  )
}
export function OperationsProjectDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [project, setProject] = useState<ProjectRecord | null>(null),
    [members, setMembers] = useState<OperationsMember[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const saving = useRef(false),
    [tab, setTab] = useState<
      'overview' | 'calendar' | 'tasks' | 'assets' | 'activity'
    >('overview')
  const [task, setTask] = useState<ProjectTask | null>(null),
    [settings, setSettings] = useState(false),
    [taskFilter, setTaskFilter] = useState('all'),
    [note, setNote] = useState('')
  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const [p, m] = await Promise.all([loadProject(id), loadMembers()])
      setProject(p)
      setMembers(m)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])
  useEffect(() => {
    setProject(null)
    setTask(null)
    void reload()
  }, [reload])
  useEffect(() => {
    const taskId = params.get('task')
    if (project && taskId) {
      const found = project.tasks.find((t) => t.id === taskId)
      if (found) setTask(found)
      setParams({}, { replace: true })
    }
  }, [project, params, setParams])
  async function commit(next: ProjectRecord) {
    if (saving.current) return false
    saving.current = true
    setBusy(true)
    setError('')
    try {
      setProject(await saveProject(next))
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  async function persistTask(nextTask: ProjectTask) {
    if (!project) return false
    const next = {
      ...project,
      tasks: project.tasks.some((t) => t.id === nextTask.id)
        ? project.tasks.map((t) => (t.id === nextTask.id ? nextTask : t))
        : [...project.tasks, nextTask],
    }
    return commit(next)
  }
  function openEvent(event: OperationCalendarEvent) {
    if (event.taskId) {
      const found = project?.tasks.find((t) => t.id === event.taskId)
      if (found) setTask(found)
    } else setSettings(true)
  }
  async function move(event: OperationCalendarEvent, date: string) {
    if (!project || busy) return
    const original = project.tasks.find((t) => t.id === event.taskId)
    if (!original) return
    const dependents = project.tasks.filter((t) => t.blockedBy === original.id)
    if (dependents.length) {
      setTask({
        ...original,
        [event.kind === 'publication' ? 'publishDate' : 'dueDate']: date,
      })
      return
    }
    await persistTask({
      ...original,
      [event.kind === 'publication' ? 'publishDate' : 'dueDate']: date,
    })
  }
  if (loading)
    return (
      <Layout title="Operations">
        <div className="ops">
          <p className="ops-empty">Loading project…</p>
        </div>
      </Layout>
    )
  if (!project)
    return (
      <Layout title="Operations">
        <div className="ops">
          <Link to="/operations">← Back to projects</Link>
          <ErrorNotice
            error={error || 'Project not found'}
            retry={() => void reload()}
          />
        </div>
      </Layout>
    )
  const today = toDateKey(new Date())
  const open = project.tasks.filter((t) => t.status !== 'done')
  const upcoming = [...open]
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .slice(0, 6)
  const review = open.filter((t) => t.status === 'in_review'),
    late = open.filter((t) => isOverdue(t, today))
  const filtered = project.tasks.filter(
    (t) =>
      taskFilter === 'all' ||
      (taskFilter === 'mine' ? t.ownerId === user?.id : t.phase === taskFilter),
  )
  async function postComment(taskId = '') {
    if (!project || !note.trim()) return
    const saved = await commit({
      ...project,
      comments: [
        ...project.comments,
        {
          id: crypto.randomUUID(),
          author: user?.name || '',
          message: note.trim(),
          createdAt: new Date().toISOString(),
          taskId,
        },
      ],
    })
    if (saved) setNote('')
  }
  async function applyProcedure(phase: ProjectStage, anchor: string) {
    const additions = buildProcedure(
      phase,
      anchor,
      project!.owner,
      project!.tasks,
      project!.workflow.launchDate,
      project!.workflow,
    )
    const saved = await commit({
      ...project!,
      tasks: [...project!.tasks, ...additions],
    })
    if (saved) setSettings(false)
    return saved
  }
  return (
    <Layout title="Operations">
      <div className="ops">
        <Link className="ops-back" to="/operations">
          <ArrowLeft size={15} /> All projects
        </Link>
        <header className="ops-project-header">
          <div>
            <span className="ops-eyebrow">
              {project.currentStage.toUpperCase()} ·{' '}
              {project.status.toUpperCase()}
            </span>
            <h1>{project.propertyAddress || project.name}</h1>
            <p>
              {project.clientName} <span>·</span>{' '}
              {project.owner || 'Unassigned lead'} <span>·</span> Signed{' '}
              {dateOnly(project.signedDate) || 'date not recorded'}
            </p>
          </div>
          <div className="ops-actions">
            <button onClick={() => setSettings(true)}>Project settings</button>
            <button
              className="ops-primary"
              disabled={busy}
              onClick={() =>
                setTask(
                  newTask(
                    '',
                    project.currentStage === 'Completed'
                      ? 'Closed'
                      : project.currentStage,
                  ),
                )
              }
            >
              <Plus size={16} /> Add deliverable
            </button>
          </div>
        </header>
        <div className="ops-project-team">
          <MemberIdentity name={project.owner} members={members} />
          <span className="ops-hint">Project lead</span>
          {members
            .filter(
              (member) =>
                member.name !== project.owner &&
                (project.workflow.collaboratorIds?.includes(member.id) ||
                  project.tasks.some(
                    (task) =>
                      task.ownerId === member.id ||
                      task.approverId === member.id,
                  )),
            )
            .map((member) => (
              <MemberIdentity
                key={member.id}
                name={member.name}
                id={member.id}
                members={members}
              />
            ))}
          <button type="button" onClick={() => setSettings(true)}>
            Manage team
          </button>
        </div>
        <ErrorNotice error={error} retry={() => void reload()} />
        {busy && (
          <p className="ops-hint" role="status">
            Saving changes…
          </p>
        )}
        <div className="ops-phase-strip">
          {PROJECT_STAGES.map((stage, index) => (
            <div
              key={stage}
              className={project.currentStage === stage ? 'active' : ''}
            >
              <span>{index + 1}</span>
              {stage}
            </div>
          ))}
          <Progress project={project} />
        </div>
        <div className="ops-tabs">
          {(
            ['overview', 'calendar', 'tasks', 'assets', 'activity'] as const
          ).map((t) => (
            <button
              key={t}
              className={tab === t ? 'active' : ''}
              onClick={() => setTab(t)}
            >
              {t === 'tasks' ? 'Deliverables' : t[0].toUpperCase() + t.slice(1)}
              {t === 'assets' && <small>{project.assets.length}</small>}
            </button>
          ))}
        </div>
        {tab === 'overview' && (
          <>
            <div className="ops-overview">
              <section className="ops-panel">
                <div className="ops-section-heading">
                  <div>
                    <span className="ops-eyebrow">KEEP THE WORK MOVING</span>
                    <h2>Up next</h2>
                  </div>
                  <button onClick={() => setTab('tasks')}>
                    All deliverables <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="ops-task-list">
                  {upcoming.map((t) => (
                    <TaskRow
                      key={t.id}
                      members={members}
                      task={t}
                      project={project}
                      onOpen={() => setTask(t)}
                      today={today}
                    />
                  ))}
                  {!upcoming.length && (
                    <p className="ops-empty">
                      All deliverables complete. Review the project result in
                      settings.
                    </p>
                  )}
                </div>
              </section>
              <aside className="ops-panel ops-attention">
                <span className="ops-eyebrow">NEEDS ATTENTION</span>
                <h2>{late.length + review.length} items to check</h2>
                <p>
                  {late.length} overdue · {review.length} awaiting review
                </p>
                {[...review, ...late.filter((t) => t.status !== 'in_review')]
                  .slice(0, 4)
                  .map((t) => (
                    <button key={t.id} onClick={() => setTask(t)}>
                      <span>{t.title}</span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                <div className="ops-linked">
                  <h3>Connected workspace</h3>
                  {project.crmContactId && (
                    <Link to={`/marketing/crm/${project.crmContactId}`}>
                      CRM contact <ArrowUpRight size={14} />
                    </Link>
                  )}
                  {project.dealId && (
                    <Link to={`/transactions/${project.dealId}`}>
                      Deals <ArrowUpRight size={14} />
                    </Link>
                  )}
                  {project.listingId && (
                    <Link to={`/inventory/listings/${project.listingId}`}>
                      Listing & media vault <ArrowUpRight size={14} />
                    </Link>
                  )}
                  <Link to="/marketing/brand-marketing-hub">
                    Brand & Marketing Hub <ArrowUpRight size={14} />
                  </Link>
                  <Link to="/next">
                    Seller Journey <ArrowUpRight size={14} />
                  </Link>
                </div>
              </aside>
            </div>
            <MlsRequirementsPanel
              project={project}
              busy={busy}
              onOpen={setTask}
              onSettings={() => setSettings(true)}
              onAdd={() =>
                void commit({
                  ...project,
                  tasks: [
                    ...project.tasks,
                    ...buildMlsChecklist(
                      project.signedDate,
                      project.owner,
                      project.tasks,
                      project.workflow,
                    ),
                  ],
                })
              }
            />
            <OperationsCalendar
              projects={[project]}
              onOpen={openEvent}
              onMove={(event, date) => void move(event, date)}
            />
          </>
        )}
        {tab === 'calendar' && (
          <OperationsCalendar
            projects={[project]}
            onOpen={openEvent}
            onMove={(event, date) => void move(event, date)}
          />
        )}
        {tab === 'tasks' && (
          <section className="ops-panel">
            <div className="ops-section-heading">
              <div>
                <h2>Deliverables</h2>
                <p>
                  Open any item to create content, assign an owner, or request
                  approval.
                </p>
              </div>
              <div className="ops-actions">
                <button onClick={() => downloadContentPlan(project)}>
                  Export content plan
                </button>
                <select
                  aria-label="Filter deliverables"
                  value={taskFilter}
                  onChange={(e) => setTaskFilter(e.target.value)}
                >
                  <option value="all">All phases</option>
                  <option value="mine">Assigned to me</option>
                  {PROJECT_STAGES.filter((s) => s !== 'Completed').map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="ops-task-list">
              {filtered.map((t) => (
                <TaskRow
                  members={members}
                  key={t.id}
                  task={t}
                  project={project}
                  onOpen={() => setTask(t)}
                  today={today}
                />
              ))}
              {!filtered.length && (
                <p className="ops-empty">No deliverables in this view.</p>
              )}
            </div>
          </section>
        )}
        {tab === 'assets' && (
          <AssetsPanel project={project} busy={busy} onSave={commit} />
        )}
        {tab === 'activity' && (
          <section className="ops-panel">
            <h2>Team conversation</h2>
            <p className="ops-hint">
              Use comments inside a deliverable for specific feedback, or leave
              a project note here.
            </p>
            <div className="ops-comments">
              {project.comments.map((c) => (
                <article key={c.id}>
                  <div>
                    <MemberIdentity
                      name={c.author}
                      id={c.authorId}
                      members={members}
                    />
                    <small>{new Date(c.createdAt).toLocaleString()}</small>
                  </div>
                  {c.taskId && (
                    <button
                      onClick={() => {
                        const t = project.tasks.find((t) => t.id === c.taskId)
                        if (t) setTask(t)
                      }}
                    >
                      {project.tasks.find((t) => t.id === c.taskId)?.title ||
                        'Removed deliverable'}
                    </button>
                  )}
                  <p>{c.message}</p>
                </article>
              ))}
            </div>
            <label>
              Project note
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={5000}
                rows={3}
              />
            </label>
            <button
              className="ops-primary"
              disabled={busy || !note.trim()}
              onClick={() => void postComment()}
            >
              Post comment
            </button>
          </section>
        )}
        {task && (
          <TaskDrawer
            key={task.id}
            task={task}
            project={project}
            members={members}
            busy={busy}
            onClose={() => setTask(null)}
            onSave={async (next) => {
              const saved = await persistTask(next)
              if (saved) setTask(null)
              return saved
            }}
            onComment={async (message) =>
              commit({
                ...project,
                comments: [
                  ...project.comments,
                  {
                    id: crypto.randomUUID(),
                    author: user?.name || '',
                    message,
                    createdAt: new Date().toISOString(),
                    taskId: task.id,
                  },
                ],
              })
            }
            onDelete={async () => {
              if (project.tasks.some((t) => t.blockedBy === task.id)) {
                setError(
                  'Remove dependent task links before deleting this deliverable.',
                )
                return false
              }
              const saved = await commit({
                ...project,
                tasks: project.tasks.filter((t) => t.id !== task.id),
              })
              if (saved) setTask(null)
              return saved
            }}
            error={error}
          />
        )}
        {settings && (
          <ProjectSettings
            members={members}
            project={project}
            busy={busy}
            onClose={() => setSettings(false)}
            onSave={async (next) => {
              const saved = await commit(next)
              if (saved) setSettings(false)
              return saved
            }}
            onProcedure={applyProcedure}
            onDelete={async (confirmation) => {
              if (saving.current) return false
              saving.current = true
              setBusy(true)
              setError('')
              try {
                await deleteProject(project, confirmation)
                navigate('/operations', { replace: true })
                return true
              } catch (e) {
                setError((e as Error).message)
                return false
              } finally {
                saving.current = false
                setBusy(false)
              }
            }}
            error={error}
          />
        )}
      </div>
    </Layout>
  )
}
function TaskRow({
  members = [],
  task,
  project,
  onOpen,
  today,
}: {
  task: ProjectTask
  members?: OperationsMember[]
  project: ProjectRecord
  onOpen: () => void
  today: string
}) {
  const blocker = taskBlocker(task, project.tasks)
  return (
    <button
      className={`ops-work-row ${task.status === 'done' ? 'completed' : ''}`}
      onClick={onOpen}
    >
      <span
        className={`ops-task-icon ${task.status === 'done' ? 'complete' : ''}`}
      >
        {task.status === 'done' ? (
          <CheckCircle2 size={18} />
        ) : (
          <ClipboardList size={17} />
        )}
      </span>
      <div>
        <strong>{task.title}</strong>
        <small>
          <MemberIdentity
            name={task.owner}
            id={task.ownerId}
            members={members}
          />{' '}
          · {task.phase}
          {task.platform ? ` · ${task.platform}` : ''}
          {blocker ? ` · Waiting for ${blocker}` : ''}
        </small>
      </div>
      <span className={`ops-pill status-${task.status}`}>
        {STATUS_LABELS[task.status]}
      </span>
      <span className={isOverdue(task, today) ? 'ops-danger' : 'ops-due'}>
        {dateOnly(task.dueDate) || 'No deadline'}
      </span>
      <ArrowUpRight size={15} />
    </button>
  )
}
