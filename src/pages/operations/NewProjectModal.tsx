import { useOperationsDialog } from './useOperationsDialog'
import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { emptyWorkflow, type ProjectRecord } from '@/domain/operations'
import { normalizeProject, operationsRequest } from './operations-api'
import { toDateKey } from './operations-calendar'
export function NewProjectModal({
  onClose,
  onCreated,
  defaultOwner,
}: {
  onClose: () => void
  onCreated: (p: ProjectRecord) => void
  defaultOwner: string
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const dialog = useOperationsDialog(onClose, busy)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      const result = await operationsRequest<{ project: ProjectRecord }>(
        '/projects',
        {
          method: 'POST',
          body: JSON.stringify({
            name: `${data.get('address')} · ${data.get('client') || 'Listing'}`,
            propertyAddress: data.get('address'),
            clientName: data.get('client'),
            owner: data.get('owner'),
            signedDate: data.get('signed'),
            dueDate: data.get('launch'),
            useTemplate: data.get('template') === 'on',
            agreementConfirmed: data.get('confirmed') === 'on',
            workflow: {
              ...emptyWorkflow(),
              launchDate: data.get('launch'),
              agreementReference: data.get('agreement'),
            },
          }),
        },
      )
      onCreated(normalizeProject(result.project))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ops-overlay">
      <section
        className="ops-modal"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
      >
        <div className="ops-section-heading">
          <div>
            <span className="ops-eyebrow">A SHARED STARTING POINT</span>
            <h2 id="new-project-title">Start a project</h2>
          </div>
          <button aria-label="Close" disabled={busy} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={busy}>
            <label>
              Property address
              <input
                name="address"
                required
                maxLength={400}
                placeholder="123 Main Street, Unit 4B"
                autoFocus
              />
            </label>
            <div className="ops-form-grid">
              <label>
                Client name
                <input name="client" maxLength={200} />
              </label>
              <label>
                Project lead
                <input
                  name="owner"
                  required
                  maxLength={120}
                  defaultValue={defaultOwner}
                />
              </label>
              <label>
                Agreement signed
                <input
                  name="signed"
                  type="date"
                  required
                  defaultValue={toDateKey(new Date())}
                />
              </label>
              <label>
                Target launch
                <input name="launch" type="date" required />
              </label>
            </div>
            <label>
              Signed agreement reference
              <input
                name="agreement"
                required
                maxLength={500}
                placeholder="Document name, vault reference, or signed agreement URL"
              />
            </label>
            <label className="ops-check">
              <input type="checkbox" name="confirmed" required /> I confirm the
              agreement is signed.
            </label>
            <label className="ops-check">
              <input type="checkbox" name="template" defaultChecked /> Add the
              first-week checklist and 21-day content plan
            </label>
            <p className="ops-hint">
              Suggested deadlines are editable. Publication dates start from
              your target launch date.
            </p>
            {error && (
              <div className="ops-error" role="alert">
                {error}
              </div>
            )}
            <div className="ops-actions end">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="ops-primary" type="submit">
                {busy ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  )
}
