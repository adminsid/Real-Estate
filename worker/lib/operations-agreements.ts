import type { Env } from '../index'
import {
  buildProcedure,
  emptyWorkflow,
  shiftDate,
} from '../../src/domain/operations'

type AgreementActor = { userId: string; tenantId: string; role: string }
type VerifiedAgreement = {
  id: string
  tenant_id: string
  listing_id: string
  event_type: string
  occurred_at: string
  evidence_document_id: string
}

function verifiedAgreement(
  value: unknown,
  listingId: string,
  actor: AgreementActor,
): VerifiedAgreement {
  if (!value || typeof value !== 'object')
    throw new Error('Missing verified agreement')
  const event = value as VerifiedAgreement
  if (
    !['admin', 'broker'].includes(actor.role) ||
    event.tenant_id !== actor.tenantId ||
    event.listing_id !== listingId ||
    event.event_type !== 'agreement_executed' ||
    typeof event.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(event.id) ||
    typeof event.evidence_document_id !== 'string' ||
    !event.evidence_document_id ||
    typeof event.occurred_at !== 'string' ||
    !Number.isFinite(Date.parse(event.occurred_at)) ||
    Date.parse(event.occurred_at) > Date.now()
  )
    throw new Error('Invalid verified agreement')
  return event
}

/** Called only after Inventory acknowledges the evidence-backed event. Replays preserve customized work. */
export async function startOperationsAgreement(
  env: Env,
  value: unknown,
  listingId: string,
  actor: AgreementActor,
  inventoryHeaders: Record<string, string>,
) {
  const event = verifiedAgreement(value, listingId, actor)
  const projectId = `agreement-${event.id}`
  const existing = await env.DB.prepare(
    'SELECT id,tenant_id FROM operations_projects WHERE id=?',
  )
    .bind(projectId)
    .first<{ id: string; tenant_id: string }>()
  if (existing) {
    if (existing.tenant_id !== actor.tenantId)
      throw new Error('Agreement project unavailable')
    return { id: existing.id, created: false }
  }
  let propertyAddress = ''
  // Metadata improves the label; an unavailable property service must not stop the agreement clock.
  try {
    const response = await fetch(
      `${env.INVENTORY_WORKER_URL}/api/listings/${encodeURIComponent(listingId)}`,
      { headers: inventoryHeaders },
    )
    if (response.ok) {
      const payload = (await response.json()) as {
        project?: Record<string, unknown>
      } & Record<string, unknown>
      const listing = payload.project || payload
      if (
        listing.id === listingId &&
        (!listing.tenantId || listing.tenantId === actor.tenantId)
      ) {
        const address = listing.address || listing.name
        if (typeof address === 'string') propertyAddress = address.slice(0, 400)
      }
    }
  } catch {
    /* The project retains its canonical listing link when metadata is offline. */
  }
  const owner = await env.DB.prepare(
    'SELECT name FROM users WHERE id=? AND tenant_id=? AND is_active=1',
  )
    .bind(actor.userId, actor.tenantId)
    .first<{ name?: string }>()
  const ownerName = owner?.name || actor.userId
  const signedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(event.occurred_at))
  const launchDate = shiftDate(signedDate, 7)
  const workflow = {
    ...emptyWorkflow(),
    launchDate,
    agreementReference: `Inventory event ${event.id}; evidence ${event.evidence_document_id}`,
  }
  const tasks = buildProcedure(
    'Marketing Plan',
    signedDate,
    ownerName,
    [],
    launchDate,
    workflow,
  ).map((task) => ({
    ...task,
    ownerId: actor.userId,
    approverId: task.requiresApproval ? actor.userId : '',
  }))
  const commandId = crypto.randomUUID()
  const now = new Date().toISOString()
  const guard =
    'EXISTS(SELECT 1 FROM operations_projects WHERE id=? AND tenant_id=? AND last_command_id=?)'
  const statements = [
    env.DB.prepare(
      `INSERT OR IGNORE INTO operations_projects
    (id,tenant_id,name,property_address,listing_id,owner,signed_date,current_stage,status,due_date,
     workflow_json,last_command_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'Listing Agreement Signed','Active',?,?,?,?,?)`,
    ).bind(
      projectId,
      actor.tenantId,
      (propertyAddress || `Listing agreement ${listingId}`).slice(0, 200),
      propertyAddress || null,
      listingId,
      ownerName,
      signedDate,
      launchDate,
      JSON.stringify(workflow),
      commandId,
      now,
      now,
    ),
  ]
  for (const task of tasks) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO operations_project_tasks
      (id,tenant_id,project_id,title,owner,due_date,status,details_json,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
      ).bind(
        task.id,
        actor.tenantId,
        projectId,
        task.title,
        ownerName,
        task.dueDate || null,
        task.status,
        JSON.stringify(task),
        now,
        now,
        projectId,
        actor.tenantId,
        commandId,
      ),
    )
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO operations_project_comments
    (id,tenant_id,project_id,author,message,created_at,author_user_id)
    SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
    ).bind(
      crypto.randomUUID(),
      actor.tenantId,
      projectId,
      ownerName,
      `Project started from verified agreement ${event.id}. Target launch is seven days after signing; confirm it in project settings.`,
      now,
      actor.userId,
      projectId,
      actor.tenantId,
      commandId,
    ),
  )
  await env.DB.batch(statements)
  const saved = await env.DB.prepare(
    'SELECT id FROM operations_projects WHERE id=? AND tenant_id=?',
  )
    .bind(projectId, actor.tenantId)
    .first<{ id: string }>()
  if (!saved) throw new Error('Agreement project unavailable')
  return { id: saved.id, created: true }
}
