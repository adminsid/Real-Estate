import {
  MLS_REQUIREMENTS,
  mlsPhotoDeadline,
  mlsTaskDueDate,
  STATUS_LABELS,
  type ProjectRecord,
  type ProjectTask,
} from '@/domain/operations'

export function MlsRequirementsPanel({
  project,
  busy,
  onOpen,
  onAdd,
  onSettings,
}: {
  project: ProjectRecord
  busy: boolean
  onOpen: (task: ProjectTask) => void
  onAdd: () => void
  onSettings: () => void
}) {
  const missing = MLS_REQUIREMENTS.some(
    (rule) =>
      !project.tasks.some((task) => task.presetKey === `mls:v1:${rule.id}`),
  )
  function deadline(id: string) {
    const date = mlsTaskDueDate(id, project.signedDate, project.workflow)
    if (id === 'entry')
      return date
        ? `Before midnight on ${date} · New York time`
        : 'Record the Listing Date in project settings'
    if (id === 'cooperation')
      return date
        ? `Confirmed business-day deadline: ${date}`
        : 'Within one business day of first public marketing'
    if (id === 'photo') {
      const timestamp = mlsPhotoDeadline(project.workflow.mlsEnteredAt || '')
      return timestamp
        ? `Due ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))} · New York time`
        : 'Within 24 hours of MLS entry · record entry time in settings'
    }
    if (id === 'original-date')
      return project.workflow.originalListingDate
        ? `Retained Listing Date: ${project.workflow.originalListingDate}`
        : 'Confirm retained date or documented 60-day exception'
    return 'Before MLS submission'
  }
  return (
    <section className="ops-panel ops-mls">
      <div className="ops-section-heading">
        <h2>MLS requirements</h2>
        <button onClick={onSettings} disabled={busy}>
          Listing dates
        </button>
      </div>
      <div className="ops-mls-rules">
        {MLS_REQUIREMENTS.map((rule) => {
          const task = project.tasks.find(
            (t) => t.presetKey === `mls:v1:${rule.id}`,
          )
          return (
            <details key={rule.id}>
              <summary>
                <span>
                  <strong>{rule.title}</strong>
                  <small>{deadline(rule.id)}</small>
                </span>
                {task && (
                  <span className={`ops-pill status-${task.status}`}>
                    {STATUS_LABELS[task.status]}
                  </span>
                )}
              </summary>
              <p>{rule.description}</p>
              <div className="ops-actions">
                {task && (
                  <button onClick={() => onOpen(task)}>Open deliverable</button>
                )}
                <a href={rule.source} target="_blank" rel="noreferrer">
                  OneKey rule
                </a>
              </div>
            </details>
          )
        })}
      </div>
      {missing && (
        <button disabled={busy} onClick={onAdd}>
          Add missing MLS deliverables
        </button>
      )}
    </section>
  )
}
