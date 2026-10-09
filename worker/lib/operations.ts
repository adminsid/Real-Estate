import { searchOperationsRecords } from './operations-records'
import { handleOperationsFiles } from './operations-files'
import {
  OPERATIONS_STAGE_OPTIONS,
  OPERATIONS_STATUS_OPTIONS,
  validateBoundedString,
  validateIsoDateString,
  validateOperationsTasks,
  validateOperationsComments,
  canAccessOperationsWorkspace,
  validateOperationsLinks,
  validateAssetReferences,
  taskFromInput,
  validateDetails,
  validateAssignments,
} from './operations-validation'
import type { Env } from '../index'
import { requireAuth } from './auth'
import {
  buildProcedure,
  emptyWorkflow,
  newTask,
  normalizeProjectStage,
  type ProjectTask,
  type ProjectWorkflow,
} from '../../src/domain/operations'
const json = (data: unknown, status = 200) => Response.json(data, { status })
const ok = (data: unknown) => json({ success: true, data })
const err = (error: string, status = 400) =>
  json({ success: false, error }, status)
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing request body')
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 1000000) {
      await reader.cancel()
      throw new Error('Project request is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Expected a JSON object')
  return body as Record<string, unknown>
}

type OperationsProjectRow = {
  id: string
  tenant_id: string
  name: string
  client_name: string | null
  property_address: string | null
  deal_id: string | null
  listing_id: string | null
  crm_contact_id: string | null
  owner: string | null
  signed_date: string | null
  current_stage: string | null
  status: string | null
  due_date: string | null
  completion: number | null
  workflow_json: string | null
  assets_json: string | null
  version: number | null
  created_at: string
  updated_at: string
}

type OperationsTaskRow = {
  id: string
  tenant_id: string
  project_id: string
  title: string
  owner: string | null
  due_date: string | null
  status: string | null
  details_json: string | null
  created_at: string
  updated_at: string
}

type OperationsCommentRow = {
  id: string
  tenant_id: string
  project_id: string
  task_id: string | null
  author: string
  author_user_id: string | null
  message: string
  created_at: string
}

function normalizeOperationsAssets(
  raw: string | null,
): Array<Record<string, unknown>> {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? (parsed as Array<Record<string, unknown>>)
      : []
  } catch {
    return []
  }
}

function projectFromRows(
  row: OperationsProjectRow,
  taskRows: OperationsTaskRow[],
  commentRows: OperationsCommentRow[],
) {
  return {
    id: row.id,
    name: row.name,
    version: Number(row.version ?? 1),
    clientName: row.client_name || '',
    propertyAddress: row.property_address || '',
    dealId: row.deal_id || '',
    listingId: row.listing_id || '',
    crmContactId: row.crm_contact_id || '',
    owner: row.owner || 'Ops Team',
    signedDate: row.signed_date || '',
    currentStage: normalizeProjectStage(
      row.current_stage || 'Listing Agreement Signed',
    ),
    status: row.status || 'Active',
    dueDate: row.due_date || '',
    completion: Number(row.completion || 0),
    assets: normalizeOperationsAssets(row.assets_json),
    workflow: {
      ...emptyWorkflow(),
      ...JSON.parse(row.workflow_json || '{}'),
    } as ProjectWorkflow,
    tasks: taskRows.map((task) => ({
      ...newTask(),
      ...(JSON.parse(task.details_json || '{}') as Partial<ProjectTask>),
      id: task.id,
      title: task.title,
      owner: task.owner || 'Ops Team',
      dueDate: task.due_date || '',
      status: task.status || 'todo',
      phase: normalizeProjectStage(
        JSON.parse(task.details_json || '{}').phase || 'Marketing',
      ),
    })),
    comments: commentRows.map((comment) => ({
      id: comment.id,
      taskId: comment.task_id || '',
      author: comment.author,
      authorId: comment.author_user_id || undefined,
      message: comment.message,
      createdAt: comment.created_at,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
async function loadOperationsProject(
  env: Env,
  tenantId: string,
  projectId: string,
) {
  const [row, tasks, comments] = await Promise.all([
    env.DB.prepare(
      'SELECT * FROM operations_projects WHERE id=? AND tenant_id=?',
    )
      .bind(projectId, tenantId)
      .first<OperationsProjectRow>(),
    env.DB.prepare(
      'SELECT * FROM operations_project_tasks WHERE project_id=? AND tenant_id=? ORDER BY due_date,created_at',
    )
      .bind(projectId, tenantId)
      .all<OperationsTaskRow>(),
    env.DB.prepare(
      'SELECT * FROM operations_project_comments WHERE project_id=? AND tenant_id=? ORDER BY created_at',
    )
      .bind(projectId, tenantId)
      .all<OperationsCommentRow>(),
  ])
  return row ? projectFromRows(row, tasks.results, comments.results) : null
}

export async function handleOperations(request: Request, env: Env) {
  const path = new URL(request.url).pathname
  const method = request.method
  const session = await requireAuth(request, env.JWT_SECRET, env.DB)
  const actor = await env.DB.prepare(
    'SELECT * FROM users WHERE id=? AND tenant_id=?',
  )
    .bind(session.userId, session.tenantId)
    .first<{ name?: string }>()
  const author = actor?.name || session.userId
  const reviewer = ['admin', 'broker'].includes(session.role)

  if (!canAccessOperationsWorkspace(session.role)) {
    return err('No access to operations workspace', 403)
  }

  if (path === '/api/operations/records' && method === 'GET')
    return searchOperationsRecords(request, env, session)

  if (path === '/api/operations/members' && method === 'GET') {
    const rows = await env.DB.prepare(
      "SELECT id,name,role,avatar_url AS avatarUrl FROM users WHERE tenant_id=? AND is_active=1 AND role IN ('admin','broker','salesperson') ORDER BY name",
    )
      .bind(session.tenantId)
      .all()
    return ok(rows.results)
  }

  if (path === '/api/operations/projects' && method === 'GET') {
    // Bound the portfolio and load related rows in two queries, independent of project count.
    const page = Number(new URL(request.url).searchParams.get('page') || 0)
    if (!Number.isInteger(page) || page < 0) return err('Invalid page')
    const rows = await env.DB.prepare(
      'SELECT * FROM operations_projects WHERE tenant_id=? ORDER BY updated_at DESC,id LIMIT 100 OFFSET ?',
    )
      .bind(session.tenantId, page * 100)
      .all<OperationsProjectRow>()
    const ids = rows.results.map((row) => row.id)
    if (!ids.length) return ok({ projects: [], hasMore: false })
    const placeholders = ids.map(() => '?').join(',')
    const [tasks, comments] = await Promise.all([
      env.DB.prepare(
        `SELECT * FROM operations_project_tasks WHERE tenant_id=? AND project_id IN (${placeholders}) ORDER BY due_date,created_at`,
      )
        .bind(session.tenantId, ...ids)
        .all<OperationsTaskRow>(),
      env.DB.prepare(
        `SELECT * FROM operations_project_comments WHERE tenant_id=? AND project_id IN (${placeholders}) ORDER BY created_at`,
      )
        .bind(session.tenantId, ...ids)
        .all<OperationsCommentRow>(),
    ])
    return ok({
      projects: rows.results.map((row) =>
        projectFromRows(
          row,
          tasks.results.filter((t) => t.project_id === row.id),
          comments.results.filter((c) => c.project_id === row.id),
        ),
      ),
      hasMore: rows.results.length === 100,
    })
  }

  if (path === '/api/operations/projects' && method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = await readBody(request)
    } catch (error) {
      return err((error as Error).message)
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return err('Project name is required', 400)
    }

    if (name.length > 200)
      return err('Project name must be 200 characters or fewer', 400)

    const clientNameError = validateBoundedString(
      body.clientName,
      'clientName',
      200,
    )
    if (clientNameError) return err(clientNameError, 400)

    const propertyAddressError = validateBoundedString(
      body.propertyAddress,
      'propertyAddress',
      400,
    )
    if (propertyAddressError) return err(propertyAddressError, 400)

    const ownerError = validateBoundedString(body.owner, 'owner', 120)
    if (ownerError) return err(ownerError, 400)

    const signedDateError = validateIsoDateString(body.signedDate, 'signedDate')
    if (signedDateError) return err(signedDateError, 400)

    const dueDateError = validateIsoDateString(body.dueDate, 'dueDate')
    if (dueDateError) return err(dueDateError, 400)

    if (body.currentStage !== undefined) {
      if (
        typeof body.currentStage !== 'string' ||
        !OPERATIONS_STAGE_OPTIONS.has(body.currentStage)
      ) {
        return err(
          `currentStage must be one of: ${Array.from(OPERATIONS_STAGE_OPTIONS).join(', ')}`,
          400,
        )
      }
    }

    if (body.status !== undefined) {
      if (
        typeof body.status !== 'string' ||
        !OPERATIONS_STATUS_OPTIONS.has(body.status)
      ) {
        return err(
          `status must be one of: ${Array.from(OPERATIONS_STATUS_OPTIONS).join(', ')}`,
          400,
        )
      }
    }

    if (body.completion !== undefined) {
      if (
        typeof body.completion !== 'number' ||
        !Number.isFinite(body.completion)
      ) {
        return err('completion must be a number between 0 and 100', 400)
      }
      if (body.completion < 0 || body.completion > 100) {
        return err('completion must be between 0 and 100', 400)
      }
    }

    const extraError = validateDetails(body)
    if (extraError) return err(extraError)
    const tasksError = validateOperationsTasks(body.tasks)
    if (tasksError) return err(tasksError, 400)

    const commentsError = validateOperationsComments(body.comments)
    if (commentsError) return err(commentsError, 400)

    if (body.useTemplate === true) {
      if (!body.signedDate || body.agreementConfirmed !== true)
        return err(
          'Confirm the signed agreement and its date before starting the preset',
        )
      body.tasks = buildProcedure(
        'Marketing Plan',
        String(body.signedDate),
        String(body.owner || author),
        [],
        String((body.workflow as ProjectWorkflow)?.launchDate || ''),
        { ...emptyWorkflow(), ...(body.workflow as Partial<ProjectWorkflow>) },
      )
    }
    const assetReferenceError = validateAssetReferences(
      body.tasks,
      (body.assets || []) as Array<{ id: string }>,
    )
    if (assetReferenceError) return err(assetReferenceError)
    const assignmentError = await validateAssignments(
      env,
      session.tenantId,
      body.tasks,
      (body.workflow as ProjectWorkflow | undefined)?.collaboratorIds,
    )
    if (assignmentError) return err(assignmentError)
    const projectId = crypto.randomUUID()
    const now = new Date().toISOString()
    const clientName =
      typeof body.clientName === 'string' ? body.clientName.trim() : ''
    const propertyAddress =
      typeof body.propertyAddress === 'string'
        ? body.propertyAddress.trim()
        : ''
    const dealId = typeof body.dealId === 'string' ? body.dealId.trim() : ''
    const listingId =
      typeof body.listingId === 'string' ? body.listingId.trim() : ''
    const crmContactId =
      typeof body.crmContactId === 'string' ? body.crmContactId.trim() : ''
    const owner =
      typeof body.owner === 'string' ? body.owner.trim() : 'Ops Team'
    const signedDate =
      typeof body.signedDate === 'string' ? body.signedDate : ''
    const currentStage =
      typeof body.currentStage === 'string'
        ? normalizeProjectStage(body.currentStage)
        : 'Listing Agreement Signed'
    const status = typeof body.status === 'string' ? body.status : 'Active'
    const dueDate = typeof body.dueDate === 'string' ? body.dueDate : ''
    const completion = Number(
      typeof body.completion === 'number' ? body.completion : 0,
    )
    const assetsJson = JSON.stringify(
      Array.isArray(body.assets) ? body.assets : [],
    )
    const initialVersion = 1

    const linkValidationError = await validateOperationsLinks(
      env,
      session.tenantId,
      { dealId, crmContactId, listingId },
      { userId: session.userId, role: session.role },
    )
    if (linkValidationError) {
      return err(linkValidationError.message, linkValidationError.status)
    }

    const statements = [
      env.DB.prepare(
        `INSERT INTO operations_projects (
          id,tenant_id,name,client_name,property_address,deal_id,listing_id,crm_contact_id,owner,signed_date,
          current_stage,status,due_date,completion,assets_json,version,created_at,updated_at,workflow_json
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        projectId,
        session.tenantId,
        name,
        clientName || null,
        propertyAddress || null,
        dealId || null,
        listingId || null,
        crmContactId || null,
        owner,
        signedDate || null,
        currentStage,
        status,
        dueDate || null,
        completion,
        assetsJson,
        initialVersion,
        now,
        now,
        JSON.stringify(body.workflow || emptyWorkflow()),
      ),
    ]
    for (const value of (body.tasks || []) as Array<Record<string, unknown>>) {
      const task = taskFromInput(value)
      task.approvedBy = ''
      task.approvedAt = ''
      if (task.status === 'approved')
        return err('Approve new deliverables after creation')
      if (['approved', 'done'].includes(task.status) && task.requiresApproval)
        return err('New review tasks must be approved after creation')
      statements.push(
        env.DB.prepare(
          `INSERT INTO operations_project_tasks
            (id,tenant_id,project_id,title,owner,due_date,status,created_at,updated_at,details_json) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          task.id,
          session.tenantId,
          projectId,
          task.title,
          task.owner,
          task.dueDate || null,
          task.status,
          now,
          now,
          JSON.stringify(task),
        ),
      )
    }
    for (const value of (body.comments || []) as Array<
      Record<string, unknown>
    >) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO operations_project_comments(id,tenant_id,project_id,author,message,created_at,task_id,author_user_id) VALUES(?,?,?,?,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          session.tenantId,
          projectId,
          author,
          String(value.message),
          now,
          null,
          session.userId,
        ),
      )
    }
    await env.DB.batch(statements)

    const project = await loadOperationsProject(
      env,
      session.tenantId,
      projectId,
    )
    return json({ success: true, project }, 201)
  }

  const fileResponse = await handleOperationsFiles(request, env, session)
  if (fileResponse) return fileResponse

  const projectMatch = path.match(/^\/api\/operations\/projects\/([^/]+)$/)
  if (projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1])

    if (method === 'GET') {
      const project = await loadOperationsProject(
        env,
        session.tenantId,
        projectId,
      )
      if (!project) return err('Project not found', 404)
      return ok({ project })
    }

    if (method === 'DELETE') {
      if (!reviewer)
        return err('Only an admin or broker can delete a project', 403)
      let body: Record<string, unknown>
      try {
        body = await readBody(request)
      } catch {
        return err('Type delete to confirm project deletion')
      }
      if (body.confirmation !== 'delete')
        return err('Type delete to confirm project deletion')
      if (!Number.isInteger(body.version) || Number(body.version) < 1)
        return err('A current project version is required')
      const existing = await env.DB.prepare(
        'SELECT id FROM operations_projects WHERE id=? AND tenant_id=?',
      )
        .bind(projectId, session.tenantId)
        .first()
      if (!existing) return err('Project not found', 404)
      const result = await env.DB.prepare(
        'DELETE FROM operations_projects WHERE id = ? AND tenant_id = ? AND version = ?',
      )
        .bind(projectId, session.tenantId, body.version)
        .run()
      if (!result.meta.changes)
        return err('Project changed. Reload it before deleting.', 409)
      return ok({ success: true, deleted: true })
    }

    if (method === 'PUT') {
      let body: Record<string, unknown>
      try {
        body = await readBody(request)
      } catch (error) {
        return err((error as Error).message)
      }
      const existing = await loadOperationsProject(
        env,
        session.tenantId,
        projectId,
      )
      if (!existing) return err('Project not found', 404)
      if (!Number.isInteger(body.version) || Number(body.version) < 1)
        return err(
          'version is required for updates and must be a positive integer',
        )
      if (body.version !== existing.version)
        return err('Project version mismatch. Refresh and retry.', 409)
      const problem =
        validateDetails(body) ||
        validateOperationsTasks(body.tasks) ||
        validateOperationsComments(body.comments)
      if (problem) return err(problem)
      for (const [key, max] of [
        ['name', 200],
        ['clientName', 200],
        ['propertyAddress', 400],
        ['owner', 120],
      ] as const) {
        const error = validateBoundedString(body[key], key, max, key !== 'name')
        if (error) return err(error)
      }
      if (
        body.name !== undefined &&
        (typeof body.name !== 'string' || !body.name.trim())
      )
        return err('Project name cannot be blank')
      for (const key of ['signedDate', 'dueDate']) {
        const error = validateIsoDateString(body[key], key)
        if (error) return err(error)
      }
      if (
        body.currentStage !== undefined &&
        !OPERATIONS_STAGE_OPTIONS.has(String(body.currentStage))
      )
        return err('currentStage is invalid')
      if (
        body.status !== undefined &&
        !OPERATIONS_STATUS_OPTIONS.has(String(body.status))
      )
        return err('status is invalid')
      if (
        body.completion !== undefined &&
        (typeof body.completion !== 'number' ||
          !Number.isFinite(body.completion) ||
          body.completion < 0 ||
          body.completion > 100)
      )
        return err('completion must be between 0 and 100')
      const links = {
        dealId: body.dealId as string | undefined,
        listingId: body.listingId as string | undefined,
        crmContactId: body.crmContactId as string | undefined,
      }
      const linkError = await validateOperationsLinks(
        env,
        session.tenantId,
        links,
        session,
      )
      if (linkError) return err(linkError.message, linkError.status)
      const assignmentError = await validateAssignments(
        env,
        session.tenantId,
        body.tasks,
        (body.workflow as ProjectWorkflow | undefined)?.collaboratorIds,
      )
      if (assignmentError) return err(assignmentError)
      const assetReferenceError = validateAssetReferences(
        body.tasks || existing.tasks,
        (body.assets || existing.assets) as Array<{ id: string }>,
      )
      if (assetReferenceError) return err(assetReferenceError)
      const tasks = Array.isArray(body.tasks)
        ? body.tasks.map(taskFromInput)
        : (existing.tasks as ProjectTask[])
      for (const task of tasks) {
        const old = existing.tasks.find((t) => t.id === task.id)
        if (old?.requiresApproval && !task.requiresApproval && !reviewer)
          return err(
            'Only a broker or admin can remove a required approval',
            403,
          )
        if (
          !reviewer &&
          task.requiresApproval &&
          task.approverId !== (old?.approverId || '')
        ) {
          return err(
            'Only a broker or admin can assign a reviewer for required approval',
            403,
          )
        }
        // Approval is tied to the deliverable version, not a client-supplied stamp.
        const changed =
          old &&
          [
            'title',
            'description',
            'caption',
            'platform',
            'assetIds',
            'requiresApproval',
            'approverId',
          ].some(
            (key) =>
              JSON.stringify(task[key as keyof ProjectTask]) !==
              JSON.stringify(old[key]),
          )
        const assetChanged =
          old &&
          Array.isArray(body.assets) &&
          task.assetIds.some(
            (id) =>
              JSON.stringify(existing.assets.find((a) => a.id === id)) !==
              JSON.stringify(
                (body.assets as Array<Record<string, unknown>>).find(
                  (a) => a.id === id,
                ),
              ),
          )
        task.approvedBy = old?.approvedBy || ''
        task.approvedAt = old?.approvedAt || ''
        if (changed || assetChanged) {
          task.approvedBy = ''
          task.approvedAt = ''
          if (
            ['approved', 'done'].includes(task.status) &&
            task.requiresApproval
          )
            task.status = 'in_review'
        }
        if (
          task.status === 'approved' &&
          old?.status !== 'approved' &&
          old?.status !== 'done'
        ) {
          if (!reviewer && task.approverId !== session.userId)
            return err(
              'Only the assigned approver or broker can approve this task',
              403,
            )
          task.approvedBy = session.userId
          task.approvedAt = new Date().toISOString()
        }
        if (task.requiresApproval && task.status === 'done' && !task.approvedBy)
          return err('Review and approve this deliverable before completing it')
        if (
          ['approved', 'done'].includes(task.status) &&
          task.blockedBy &&
          tasks.some((t) => t.id === task.blockedBy && t.status !== 'done')
        )
          return err('Complete the blocking task first')
        if (
          task.publicationStatus !== 'planned' &&
          (!task.publishDate ||
            !task.schedulerUrl ||
            (task.requiresApproval && !task.approvedBy))
        )
          return err(
            'Publication requires an approved deliverable, date, and scheduling or published link',
          )
      }
      if (
        (body.currentStage === 'Completed' || body.status === 'Complete') &&
        !(
          body.workflow &&
          ['withdrawn', 'expired', 'cancelled'].includes(
            String((body.workflow as ProjectWorkflow).result),
          )
        ) &&
        tasks.some((t) => t.status !== 'done')
      )
        return err('Complete all deliverables before completing the project')
      const fields: Record<string, string> = {
        name: 'name',
        clientName: 'client_name',
        propertyAddress: 'property_address',
        dealId: 'deal_id',
        listingId: 'listing_id',
        crmContactId: 'crm_contact_id',
        owner: 'owner',
        signedDate: 'signed_date',
        currentStage: 'current_stage',
        status: 'status',
        dueDate: 'due_date',
        completion: 'completion',
      }
      const updates: string[] = []
      const values: (string | number | null)[] = []
      for (const [key, column] of Object.entries(fields))
        if (body[key] !== undefined) {
          updates.push(`${column}=?`)
          values.push(body[key] as string | number | null)
        }
      if (body.assets !== undefined) {
        updates.push('assets_json=?')
        values.push(JSON.stringify(body.assets))
      }
      if (body.workflow !== undefined) {
        updates.push('workflow_json=?')
        values.push(JSON.stringify(body.workflow))
      }
      if (
        !updates.length &&
        body.tasks === undefined &&
        body.comments === undefined
      )
        return ok({ project: existing })
      const commandId = crypto.randomUUID()
      const guard =
        'EXISTS(SELECT 1 FROM operations_projects WHERE id=? AND tenant_id=? AND version=? AND last_command_id=?)'
      const guardArgs = [
        projectId,
        session.tenantId,
        existing.version + 1,
        commandId,
      ]
      const statements = [
        env.DB.prepare(
          `UPDATE operations_projects SET ${[...updates, "updated_at=datetime('now')", 'version=version+1', 'last_command_id=?'].join(',')} WHERE id=? AND tenant_id=? AND version=?`,
        ).bind(
          ...values,
          commandId,
          projectId,
          session.tenantId,
          existing.version,
        ),
      ]
      if (Array.isArray(body.tasks)) {
        statements.push(
          env.DB.prepare(
            `DELETE FROM operations_project_tasks WHERE project_id=? AND tenant_id=? AND ${guard}`,
          ).bind(projectId, session.tenantId, ...guardArgs),
        )
        for (const task of tasks)
          statements.push(
            env.DB.prepare(
              `INSERT INTO operations_project_tasks
              (id,tenant_id,project_id,title,owner,due_date,status,created_at,updated_at,details_json)
              SELECT ?,?,?,?,?,?,?,?, ?,? WHERE ${guard}`,
            ).bind(
              task.id,
              session.tenantId,
              projectId,
              task.title,
              task.owner,
              task.dueDate || null,
              task.status,
              new Date().toISOString(),
              new Date().toISOString(),
              JSON.stringify(task),
              ...guardArgs,
            ),
          )
      }
      for (const task of tasks) {
        const previous = existing.tasks.find((t) => t.id === task.id)
        if (previous && previous.status !== task.status) {
          statements.push(
            env.DB.prepare(
              `INSERT INTO operations_project_comments(id,tenant_id,project_id,author,message,created_at,task_id,author_user_id)
            SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,
            ).bind(
              crypto.randomUUID(),
              session.tenantId,
              projectId,
              author,
              `Work status changed from ${previous.status} to ${task.status}.`,
              new Date().toISOString(),
              task.id,
              session.userId,
              ...guardArgs,
            ),
          )
        }
      }
      // Comments are append-only. Existing history and authors cannot be rewritten by a stale client.
      for (const value of (body.comments || []) as Array<
        Record<string, unknown>
      >) {
        if (existing.comments.some((c) => c.id === value.id)) continue
        const taskId = typeof value.taskId === 'string' ? value.taskId : ''
        if (taskId && !tasks.some((t) => t.id === taskId))
          return err('Comment task does not belong to this project')
        statements.push(
          env.DB.prepare(
            `INSERT INTO operations_project_comments(id,tenant_id,project_id,author,message,created_at,task_id,author_user_id)
              SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,
          ).bind(
            crypto.randomUUID(),
            session.tenantId,
            projectId,
            author,
            String(value.message),
            new Date().toISOString(),
            taskId || null,
            session.userId,
            ...guardArgs,
          ),
        )
      }
      const results = await env.DB.batch(statements)
      if (results[0].meta.changes !== 1)
        return err('Project version mismatch. Refresh and retry.', 409)
      return ok({
        project: await loadOperationsProject(env, session.tenantId, projectId),
      })
    }
  }

  return err('Operations endpoint not found', 404)
}
