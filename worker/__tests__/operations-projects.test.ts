import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import handler from '../index'
import { signJWT } from '../lib/crypto'
import { sqliteD1 } from '../../workers/transactions/__tests__/helpers/sqlite'
import { startOperationsAgreement } from '../lib/operations-agreements'

const TEST_JWT_SECRET = 'test-jwt-secret-min-32-bytes-long-for-hs256!!!'
const BASE_URL = 'https://workspace.primeamericany.com'

type SeedUser = { id: string; tenantId: string; role: string }

async function createSessionCookie(
  userId: string,
  tenantId: string,
  role: string,
): Promise<string> {
  const jwt = await signJWT({ userId, tenantId, role }, TEST_JWT_SECRET)
  return `re_session=${encodeURIComponent(jwt)}`
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: async () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext
}

function setup(
  users: SeedUser[] = [{ id: 'admin-a', tenantId: 'tenant-a', role: 'admin' }],
) {
  const { sqlite, db } = sqliteD1()

  sqlite.exec(`
    CREATE TABLE tenants(id TEXT PRIMARY KEY);
    CREATE TABLE users(
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT,
      avatar_url TEXT,
      professional_license_id TEXT,
      is_active INTEGER NOT NULL
    );
    CREATE TABLE transactions(
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      name TEXT, status TEXT
    );
    CREATE TABLE contacts(
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      first_name TEXT, last_name TEXT, email TEXT, phone TEXT
    );
  `)

  const tenantIds = [...new Set(users.map((user) => user.tenantId))]
  for (const tenantId of tenantIds) {
    sqlite.prepare('INSERT INTO tenants(id) VALUES (?)').run(tenantId)
  }

  for (const user of users) {
    sqlite
      .prepare(
        'INSERT INTO users(id, tenant_id, role, is_active) VALUES (?, ?, ?, 1)',
      )
      .run(user.id, user.tenantId, user.role)
  }

  sqlite.exec(
    readFileSync('worker/db/migrations/042_operations_projects.sql', 'utf8'),
  )
  sqlite.exec(
    readFileSync('worker/db/migrations/061_operations_workflow.sql', 'utf8'),
  )

  sqlite.exec(
    readFileSync(
      'worker/db/migrations/063_operations_comment_authors.sql',
      'utf8',
    ),
  )

  const env = {
    DB: db,
    JWT_SECRET: TEST_JWT_SECRET,
  } as any

  return { sqlite, env }
}

describe('Verified agreement Operations kickoff', () => {
  const event = {
    id: 'verified-agreement-1',
    tenant_id: 'tenant-a',
    listing_id: 'listing-1',
    event_type: 'agreement_executed',
    occurred_at: '2026-10-05T01:30:00.000Z',
    evidence_document_id: 'document-1',
  }
  const actor = { userId: 'admin-a', tenantId: 'tenant-a', role: 'admin' }

  it('starts an active project and dated agenda through the Inventory gateway, with idempotent retries', async () => {
    const { sqlite, env } = setup()
    env.INVENTORY_WORKER_URL = 'https://inventory.example.test'
    env.INTERNAL_API_SECRET = 'internal-test-only'
    const cookie = await createSessionCookie(
      actor.userId,
      actor.tenantId,
      actor.role,
    )
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        Response.json(
          String(input).endsWith('/business-events')
            ? { event }
            : {
                project: {
                  id: 'listing-1',
                  tenantId: 'tenant-a',
                  address: '123 Main Street',
                },
              },
        ),
      )
    const submit = () =>
      handler.fetch(
        new Request(`${BASE_URL}/api/listings/listing-1/business-events`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: 'agreement_executed' }),
        }),
        env,
        makeCtx(),
      )
    try {
      const response = await submit()
      expect(response.status).toBe(200)
      const result = (await response.json()) as {
        operationsProject: { id: string }
      }
      const project = sqlite
        .prepare('SELECT * FROM operations_projects WHERE id=?')
        .get(result.operationsProject.id) as any
      expect(project).toMatchObject({
        listing_id: 'listing-1',
        name: '123 Main Street',
        signed_date: '2026-10-04',
        due_date: '2026-10-11',
        status: 'Active',
      })
      expect(
        sqlite
          .prepare('SELECT count(*) count FROM operations_project_tasks')
          .get(),
      ).toEqual({ count: 38 })
      sqlite
        .prepare(
          "UPDATE operations_project_tasks SET title='Customized deliverable' WHERE id=(SELECT id FROM operations_project_tasks LIMIT 1)",
        )
        .run()
      expect((await submit()).status).toBe(200)
      expect(
        sqlite.prepare('SELECT count(*) count FROM operations_projects').get(),
      ).toEqual({ count: 1 })
      expect(
        sqlite
          .prepare('SELECT count(*) count FROM operations_project_tasks')
          .get(),
      ).toEqual({ count: 38 })
      expect(
        sqlite
          .prepare(
            "SELECT count(*) count FROM operations_project_tasks WHERE title='Customized deliverable'",
          )
          .get(),
      ).toEqual({ count: 1 })
      expect(
        sqlite
          .prepare('SELECT count(*) count FROM operations_project_comments')
          .get(),
      ).toEqual({ count: 1 })
    } finally {
      fetchMock.mockRestore()
      sqlite.close()
    }
  })

  it('rejects events for another tenant or listing and unverified roles before writing', async () => {
    const { sqlite, env } = setup()
    try {
      for (const [value, listingId, user] of [
        [{ ...event, tenant_id: 'tenant-b' }, 'listing-1', actor],
        [event, 'listing-2', actor],
        [event, 'listing-1', { ...actor, role: 'salesperson' }],
        [{ ...event, occurred_at: 'invalid' }, 'listing-1', actor],
      ] as const) {
        await expect(
          startOperationsAgreement(env, value, listingId, user, {}),
        ).rejects.toThrow('Invalid verified agreement')
      }
      expect(
        sqlite.prepare('SELECT count(*) count FROM operations_projects').get(),
      ).toEqual({ count: 0 })
    } finally {
      sqlite.close()
    }
  })

  it('reports a saved agreement clearly when kickoff fails and completes it on retry', async () => {
    const { sqlite, env } = setup()
    env.INVENTORY_WORKER_URL = 'https://inventory.example.test'
    const cookie = await createSessionCookie(
      actor.userId,
      actor.tenantId,
      actor.role,
    )
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        Response.json(
          String(input).endsWith('/business-events') ? { event } : {},
        ),
      )
    const batchMock = vi
      .spyOn(env.DB, 'batch')
      .mockRejectedValueOnce(new Error('Database unavailable'))
    const logMock = vi.spyOn(console, 'error').mockImplementation(() => {})
    const submit = () =>
      handler.fetch(
        new Request(`${BASE_URL}/api/listings/listing-1/business-events`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: '{}',
        }),
        env,
        makeCtx(),
      )
    try {
      const failed = await submit()
      expect(failed.status).toBe(503)
      expect(await failed.json()).toMatchObject({
        event,
        error: expect.stringContaining('Agreement verified'),
      })
      expect(
        sqlite.prepare('SELECT count(*) count FROM operations_projects').get(),
      ).toEqual({ count: 0 })
      expect((await submit()).status).toBe(200)
      expect(
        sqlite.prepare('SELECT count(*) count FROM operations_projects').get(),
      ).toEqual({ count: 1 })
    } finally {
      fetchMock.mockRestore()
      batchMock.mockRestore()
      logMock.mockRestore()
      sqlite.close()
    }
  })

  it('does not start projects for accepted offers or rejected Inventory events', async () => {
    const { sqlite, env } = setup()
    env.INVENTORY_WORKER_URL = 'https://inventory.example.test'
    const cookie = await createSessionCookie(
      actor.userId,
      actor.tenantId,
      actor.role,
    )
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    try {
      for (const [status, value] of [
        [200, { ...event, event_type: 'offer_accepted' }],
        [400, event],
      ] as const) {
        fetchMock.mockResolvedValueOnce(
          Response.json({ event: value }, { status }),
        )
        const response = await handler.fetch(
          new Request(`${BASE_URL}/api/listings/listing-1/business-events`, {
            method: 'POST',
            headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body: '{}',
          }),
          env,
          makeCtx(),
        )
        expect(response.status).toBe(status)
      }
      expect(
        sqlite.prepare('SELECT count(*) count FROM operations_projects').get(),
      ).toEqual({ count: 0 })
    } finally {
      fetchMock.mockRestore()
      sqlite.close()
    }
  })

  it('keeps the agreement clock running when Inventory metadata is unavailable', async () => {
    const { sqlite, env } = setup()
    env.INVENTORY_WORKER_URL = 'https://inventory.example.test'
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('offline'))
    try {
      const project = await startOperationsAgreement(
        env,
        event,
        'listing-1',
        actor,
        {},
      )
      expect(project.id).toBe('agreement-verified-agreement-1')
      expect(
        sqlite
          .prepare('SELECT listing_id,signed_date FROM operations_projects')
          .get(),
      ).toEqual({ listing_id: 'listing-1', signed_date: '2026-10-04' })
    } finally {
      fetchMock.mockRestore()
      sqlite.close()
    }
  })
})

describe('Operations projects API', () => {
  it('restricts deletion to admin/broker with an exact confirmation and current version, within their tenant', async () => {
    const { sqlite, env } = setup([
      { id: 'admin-a', tenantId: 'tenant-a', role: 'admin' },
      { id: 'broker-a', tenantId: 'tenant-a', role: 'broker' },
      { id: 'agent-a', tenantId: 'tenant-a', role: 'salesperson' },
      { id: 'admin-b', tenantId: 'tenant-b', role: 'admin' },
    ])
    sqlite.exec(`INSERT INTO operations_projects(id,tenant_id,name,version,crm_contact_id,deal_id) VALUES('delete-project','tenant-a','Delete fixture',4,'contact-1','deal-1');
      INSERT INTO operations_project_tasks(id,tenant_id,project_id,title) VALUES('delete-task','tenant-a','delete-project','Task');
      INSERT INTO operations_project_comments(id,tenant_id,project_id,author,message) VALUES('delete-comment','tenant-a','delete-project','Broker','Note');
      INSERT INTO contacts(id,tenant_id,is_active) VALUES('contact-1','tenant-a',1);
      INSERT INTO transactions(id,tenant_id,is_active) VALUES('deal-1','tenant-a',1);`)
    async function remove(
      userId: string,
      tenantId: string,
      role: string,
      body: unknown,
    ) {
      return handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects/delete-project`, {
          method: 'DELETE',
          headers: {
            Cookie: await createSessionCookie(userId, tenantId, role),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
        env,
        makeCtx(),
      )
    }
    try {
      expect(
        (
          await remove('agent-a', 'tenant-a', 'salesperson', {
            confirmation: 'delete',
            version: 4,
          })
        ).status,
      ).toBe(403)
      for (const confirmation of ['', 'DELETE', ' delete', true]) {
        expect(
          (
            await remove('admin-a', 'tenant-a', 'admin', {
              confirmation,
              version: 4,
            })
          ).status,
        ).toBe(400)
      }
      expect(
        (
          await remove('admin-b', 'tenant-b', 'admin', {
            confirmation: 'delete',
            version: 4,
          })
        ).status,
      ).toBe(404)
      expect(
        (
          await remove('broker-a', 'tenant-a', 'broker', {
            confirmation: 'delete',
            version: 3,
          })
        ).status,
      ).toBe(409)
      expect(
        sqlite.prepare('SELECT count(*) count FROM operations_projects').get(),
      ).toEqual({ count: 1 })
      expect(
        (
          await remove('broker-a', 'tenant-a', 'broker', {
            confirmation: 'delete',
            version: 4,
          })
        ).status,
      ).toBe(200)
      expect(
        sqlite
          .prepare('SELECT count(*) count FROM operations_project_tasks')
          .get(),
      ).toEqual({ count: 0 })
      expect(
        sqlite
          .prepare('SELECT count(*) count FROM operations_project_comments')
          .get(),
      ).toEqual({ count: 0 })
      expect(
        sqlite.prepare('SELECT count(*) count FROM contacts').get(),
      ).toEqual({ count: 1 })
      expect(
        sqlite.prepare('SELECT count(*) count FROM transactions').get(),
      ).toEqual({ count: 1 })
    } finally {
      sqlite.close()
    }
  })

  it('persists MLS dates and rejects an ambiguous MLS entry timestamp', async () => {
    const { sqlite, env } = setup()
    const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
    const create = (workflow: unknown) =>
      handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'MLS project', workflow }),
        }),
        env,
        makeCtx(),
      )
    try {
      expect((await create({ mlsEnteredAt: '2026-10-05T12:00' })).status).toBe(
        400,
      )
      const workflow = {
        mlsListingDate: '2026-10-05',
        mlsEnteredAt: '2026-10-06T12:00:00Z',
        clearCooperationDueDate: '2026-10-07',
        originalListingDate: '2026-09-01',
      }
      const response = await create(workflow)
      expect(response.status).toBe(201)
      expect(((await response.json()) as any).project.workflow).toMatchObject(
        workflow,
      )
    } finally {
      sqlite.close()
    }
  })

  it('creates, reads, updates, and deletes an operations project', async () => {
    const { sqlite, env } = setup()

    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      sqlite
        .prepare(
          'INSERT INTO transactions(id, tenant_id, is_active) VALUES (?, ?, 1)',
        )
        .run('deal-123', 'tenant-a')

      const createResponse = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Northside Launch',
            clientName: 'River Holdings',
            propertyAddress: '123 Main Street, New York, NY',
            listingId: 'listing-123',
            dealId: 'deal-123',
            tasks: [
              { id: 'task-1', title: 'Upload hero photos', status: 'todo' },
            ],
            comments: [
              {
                id: 'comment-1',
                author: 'Ops Lead',
                message: 'Kickoff complete',
              },
            ],
          }),
        }),
        env,
        makeCtx(),
      )

      expect(createResponse.status).toBe(201)
      const createdJson = await createResponse.json<any>()
      expect(createdJson.success).toBe(true)
      expect(createdJson.project.name).toBe('Northside Launch')
      expect(createdJson.project.tasks).toHaveLength(1)
      const projectId = createdJson.project.id as string

      const getResponse = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/projects/${encodeURIComponent(projectId)}`,
          {
            headers: { Cookie: cookie },
          },
        ),
        env,
        makeCtx(),
      )
      expect(getResponse.status).toBe(200)
      const getJson = await getResponse.json<any>()
      expect(getJson.success).toBe(true)
      expect(getJson.data.project.id).toBe(projectId)
      expect(getJson.data.project.tasks).toHaveLength(1)

      const updateResponse = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/projects/${encodeURIComponent(projectId)}`,
          {
            method: 'PUT',
            headers: {
              Cookie: cookie,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: 1,
              currentStage: 'Closing',
              status: 'Active',
              completion: 85,
              tasks: [
                {
                  id: 'task-2',
                  title: 'Send final statement',
                  status: 'in_progress',
                },
              ],
              comments: [
                {
                  id: 'comment-2',
                  author: 'Ops Lead',
                  message: 'Legal review pending',
                },
              ],
            }),
          },
        ),
        env,
        makeCtx(),
      )

      expect(updateResponse.status).toBe(200)
      const updateJson = await updateResponse.json<any>()
      expect(updateJson.success).toBe(true)
      expect(updateJson.data.project.currentStage).toBe('Under Contract')
      expect(updateJson.data.project.completion).toBe(85)
      expect(updateJson.data.project.tasks).toHaveLength(1)
      expect(updateJson.data.project.tasks[0].title).toBe(
        'Send final statement',
      )

      const listResponse = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          headers: { Cookie: cookie },
        }),
        env,
        makeCtx(),
      )

      expect(listResponse.status).toBe(200)
      const listJson = await listResponse.json<any>()
      expect(listJson.success).toBe(true)
      expect(listJson.data.projects).toHaveLength(1)
      expect(listJson.data.projects[0].id).toBe(projectId)

      const deleteResponse = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/projects/${encodeURIComponent(projectId)}`,
          {
            method: 'DELETE',
            headers: { Cookie: cookie, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              confirmation: 'delete',
              version: listJson.data.projects[0].version,
            }),
          },
        ),
        env,
        makeCtx(),
      )
      expect(deleteResponse.status).toBe(200)

      const afterDelete = sqlite
        .prepare(
          'SELECT COUNT(*) as total FROM operations_projects WHERE id = ?',
        )
        .get(projectId) as { total: number }
      expect(afterDelete.total).toBe(0)
    } finally {
      sqlite.close()
    }
  })

  it('returns 400 when creating a project without a name', async () => {
    const { sqlite, env } = setup()

    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const response = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ propertyAddress: 'Missing Name Ave' }),
        }),
        env,
        makeCtx(),
      )

      expect(response.status).toBe(400)
      const payload = await response.json<any>()
      expect(payload.success).toBe(false)
      expect(payload.error).toContain('Project name is required')
    } finally {
      sqlite.close()
    }
  })

  it('enforces tenant isolation on project read and list', async () => {
    const { sqlite, env } = setup([
      { id: 'admin-a', tenantId: 'tenant-a', role: 'admin' },
      { id: 'admin-b', tenantId: 'tenant-b', role: 'admin' },
    ])

    try {
      const cookieA = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const cookieB = await createSessionCookie('admin-b', 'tenant-b', 'admin')

      const createResponse = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookieA,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Tenant A Private Project',
            propertyAddress: 'One Tenant Way',
          }),
        }),
        env,
        makeCtx(),
      )
      expect(createResponse.status).toBe(201)
      const created = await createResponse.json<any>()
      const projectId = created.project.id as string

      const listB = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          headers: { Cookie: cookieB },
        }),
        env,
        makeCtx(),
      )
      expect(listB.status).toBe(200)
      const listBJson = await listB.json<any>()
      expect(listBJson.data.projects).toHaveLength(0)

      const getB = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/projects/${encodeURIComponent(projectId)}`,
          {
            headers: { Cookie: cookieB },
          },
        ),
        env,
        makeCtx(),
      )
      expect(getB.status).toBe(404)
      const getBJson = await getB.json<any>()
      expect(getBJson.success).toBe(false)
      expect(getBJson.error).toContain('Project not found')
    } finally {
      sqlite.close()
    }
  })

  it('rejects stale project versions during updates', async () => {
    const { sqlite, env } = setup()

    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      sqlite
        .prepare(
          'INSERT INTO transactions(id, tenant_id, is_active) VALUES (?, ?, 1)',
        )
        .run('deal-123', 'tenant-a')

      const createResponse = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Versioned project',
            dealId: 'deal-123',
          }),
        }),
        env,
        makeCtx(),
      )

      expect(createResponse.status).toBe(201)
      const createdJson = await createResponse.json<any>()
      const projectId = createdJson.project.id as string
      const initialVersion = createdJson.project.version as number
      expect(initialVersion).toBe(1)

      const firstUpdate = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/projects/${encodeURIComponent(projectId)}`,
          {
            method: 'PUT',
            headers: {
              Cookie: cookie,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: initialVersion,
              currentStage: 'Launch',
            }),
          },
        ),
        env,
        makeCtx(),
      )
      expect(firstUpdate.status).toBe(200)
      const firstUpdated = await firstUpdate.json<any>()
      expect(firstUpdated.data.project.version).toBe(2)

      const staleUpdate = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/projects/${encodeURIComponent(projectId)}`,
          {
            method: 'PUT',
            headers: {
              Cookie: cookie,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: initialVersion,
              currentStage: 'Closing',
            }),
          },
        ),
        env,
        makeCtx(),
      )

      expect(staleUpdate.status).toBe(409)
      const stalePayload = await staleUpdate.json<any>()
      expect(stalePayload.success).toBe(false)
      expect(stalePayload.error).toContain('version')
    } finally {
      sqlite.close()
    }
  })

  it('rejects invalid stage values on create', async () => {
    const { sqlite, env } = setup()

    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const response = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Invalid Stage Example',
            currentStage: 'Invalid Stage',
          }),
        }),
        env,
        makeCtx(),
      )

      expect(response.status).toBe(400)
      const payload = await response.json<any>()
      expect(payload.success).toBe(false)
      expect(payload.error).toContain('currentStage must be one of')
    } finally {
      sqlite.close()
    }
  })

  it('rejects missing linked deal and contact references', async () => {
    const { sqlite, env } = setup()

    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')

      const dealResponse = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Deal validation',
            dealId: 'missing-deal',
          }),
        }),
        env,
        makeCtx(),
      )

      expect(dealResponse.status).toBe(404)
      const dealPayload = await dealResponse.json<any>()
      expect(dealPayload.error).toContain(
        'dealId does not reference an active transaction',
      )

      const contactResponse = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Contact validation',
            crmContactId: 'missing-contact',
          }),
        }),
        env,
        makeCtx(),
      )

      expect(contactResponse.status).toBe(404)
      const contactPayload = await contactResponse.json<any>()
      expect(contactPayload.error).toContain(
        'crmContactId does not reference an active contact',
      )
    } finally {
      sqlite.close()
    }
  })

  it('rejects malformed listingId values', async () => {
    const { sqlite, env } = setup()

    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const response = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Listing format check',
            listingId: '../unsafe',
          }),
        }),
        env,
        makeCtx(),
      )

      expect(response.status).toBe(400)
      const payload = await response.json<any>()
      expect(payload.error).toContain('listingId is invalid')
    } finally {
      sqlite.close()
    }
  })

  it('denies operations access for unauthorized roles', async () => {
    const { sqlite, env } = setup([
      { id: 'assistant-a', tenantId: 'tenant-a', role: 'assistant' },
    ])

    try {
      const assistantCookie = await createSessionCookie(
        'assistant-a',
        'tenant-a',
        'assistant',
      )
      const response = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          headers: { Cookie: assistantCookie },
        }),
        env,
        makeCtx(),
      )

      expect(response.status).toBe(403)
      const payload = await response.json<any>()
      expect(payload.success).toBe(false)
      expect(payload.error).toContain('No access to operations workspace')
    } finally {
      sqlite.close()
    }
  })

  it('does not bump version on no-op updates', async () => {
    const { sqlite, env } = setup()

    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')

      const createResponse = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'No-op update project',
          }),
        }),
        env,
        makeCtx(),
      )

      expect(createResponse.status).toBe(201)
      const createdJson = await createResponse.json<any>()
      const projectId = createdJson.project.id as string
      const version = createdJson.project.version as number
      expect(version).toBe(1)

      const noopUpdate = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/projects/${encodeURIComponent(projectId)}`,
          {
            method: 'PUT',
            headers: {
              Cookie: cookie,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ version }),
          },
        ),
        env,
        makeCtx(),
      )

      expect(noopUpdate.status).toBe(200)
      const noopPayload = await noopUpdate.json<any>()
      expect(noopPayload.success).toBe(true)
      expect(noopPayload.data.project.version).toBe(version)
    } finally {
      sqlite.close()
    }
  })
})

async function request(env: any, cookie: string, path: string, body?: unknown) {
  return handler.fetch(
    new Request(`${BASE_URL}/api/operations${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
    makeCtx(),
  )
}
async function update(env: any, cookie: string, id: string, body: unknown) {
  return handler.fetch(
    new Request(`${BASE_URL}/api/operations/projects/${id}`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    makeCtx(),
  )
}
describe('Operations collaboration safeguards', () => {
  it('creates a complete signed-agreement preset and preserves its metadata', async () => {
    const { sqlite, env } = setup()
    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const response = await request(env, cookie, '/projects', {
        name: 'Condo launch',
        signedDate: '2026-10-05',
        useTemplate: true,
        agreementConfirmed: true,
        workflow: {
          launchDate: '2026-10-12',
          agreementReference: 'Signed listing agreement',
        },
      })
      expect(response.status).toBe(201)
      const { project } = await response.json<any>()
      expect(project.tasks).toHaveLength(38)
      expect(
        project.tasks.filter((t: any) => t.presetKey.startsWith('content:')),
      ).toHaveLength(21)
      expect(project.workflow.agreementReference).toBe(
        'Signed listing agreement',
      )
      const result = await update(env, cookie, project.id, {
        version: 1,
        tasks: project.tasks.map((t: any) => ({ ...t, owner: 'Maria' })),
      })
      expect(result.status).toBe(200)
      const saved = await result.json<any>()
      expect(
        saved.data.project.tasks.find(
          (t: any) => t.presetKey === 'content:v1:0',
        ).publishDate,
      ).toBe('2026-10-12')
    } finally {
      sqlite.close()
    }
  })
  it('requires a signed confirmation before activating a preset', async () => {
    const { sqlite, env } = setup()
    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      expect(
        (
          await request(env, cookie, '/projects', {
            name: 'Draft',
            useTemplate: true,
            signedDate: '2026-10-05',
          })
        ).status,
      ).toBe(400)
      expect(
        sqlite.prepare('SELECT count(*) AS n FROM operations_projects').get()
          ?.n,
      ).toBe(0)
    } finally {
      sqlite.close()
    }
  })
  it('allows one concurrent writer and preserves the winning tasks', async () => {
    const { sqlite, env } = setup()
    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const created = await request(env, cookie, '/projects', {
        name: 'Shared project',
      })
      const { project } = await created.json<any>()
      const responses = await Promise.all([
        update(env, cookie, project.id, {
          version: 1,
          tasks: [{ id: 'a', title: 'Writer A', status: 'todo' }],
        }),
        update(env, cookie, project.id, {
          version: 1,
          tasks: [{ id: 'b', title: 'Writer B', status: 'todo' }],
        }),
      ])
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
      const saved = await (
        await request(env, cookie, `/projects/${project.id}`)
      ).json<any>()
      expect(saved.data.project.version).toBe(2)
      expect(saved.data.project.tasks).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })
  it('protects approvals and resets approval when content changes', async () => {
    const { sqlite, env } = setup([
      { id: 'admin-a', tenantId: 'tenant-a', role: 'admin' },
      { id: 'agent-a', tenantId: 'tenant-a', role: 'salesperson' },
    ])
    try {
      const admin = await createSessionCookie('admin-a', 'tenant-a', 'admin'),
        agent = await createSessionCookie('agent-a', 'tenant-a', 'salesperson')
      const created = await request(env, admin, '/projects', {
        name: 'Review project',
        tasks: [
          {
            id: 'review',
            title: 'Listing copy',
            status: 'in_review',
            requiresApproval: true,
          },
        ],
      })
      const { project } = await created.json<any>()
      const task = project.tasks[0]
      const forbidden = await update(env, agent, project.id, {
        version: 1,
        tasks: [{ ...task, status: 'approved', approvedBy: 'agent-a' }],
      })
      expect(forbidden.status).toBe(403)
      const unapproved = await update(env, agent, project.id, {
        version: 1,
        tasks: [{ ...task, status: 'done', approvedBy: 'admin-a' }],
      })
      expect(unapproved.status).toBe(400)
      const approved = await update(env, admin, project.id, {
        version: 1,
        tasks: [{ ...task, status: 'approved' }],
      })
      expect(approved.status).toBe(200)
      const saved = await approved.json<any>()
      expect(saved.data.project.tasks[0].approvedBy).toBe('admin-a')
      const edited = await update(env, agent, project.id, {
        version: 2,
        tasks: [{ ...saved.data.project.tasks[0], caption: 'Changed content' }],
      })
      expect(edited.status).toBe(200)
      const changed = await edited.json<any>()
      expect(changed.data.project.tasks[0]).toMatchObject({
        status: 'in_review',
        approvedBy: '',
      })
    } finally {
      sqlite.close()
    }
  })
  it('keeps append-only comments with the authenticated author', async () => {
    const { sqlite, env } = setup()
    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const { project } = await (
        await request(env, cookie, '/projects', {
          name: 'Comments',
          comments: [{ message: 'Original note', author: 'Forged author' }],
        })
      ).json<any>()
      expect(project.comments[0].author).toBe('admin-a')
      expect(project.comments[0].authorId).toBe('admin-a')
      const changed = await update(env, cookie, project.id, {
        version: 1,
        comments: [
          { ...project.comments[0], message: 'Rewrite history' },
          { id: 'new', author: 'Another forgery', message: 'New note' },
        ],
      })
      expect(changed.status).toBe(200)
      const saved = await changed.json<any>()
      expect(saved.data.project.comments.map((c: any) => c.message)).toEqual([
        'Original note',
        'New note',
      ])
      expect(saved.data.project.comments[1].author).toBe('admin-a')
      expect(saved.data.project.comments[1].authorId).toBe('admin-a')
    } finally {
      sqlite.close()
    }
  })
  it('rejects unsafe assets and cyclic dependencies before any mutation', async () => {
    const { sqlite, env } = setup()
    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const { project } = await (
        await request(env, cookie, '/projects', { name: 'Safety' })
      ).json<any>()
      expect(
        (
          await update(env, cookie, project.id, {
            version: 1,
            assets: [
              {
                id: 'asset',
                name: 'Unsafe',
                kind: 'photo',
                url: 'javascript:alert(1)',
              },
            ],
          })
        ).status,
      ).toBe(400)
      expect(
        (
          await update(env, cookie, project.id, {
            version: 1,
            tasks: [
              { id: 'a', title: 'A', blockedBy: 'b' },
              { id: 'b', title: 'B', blockedBy: 'a' },
            ],
          })
        ).status,
      ).toBe(400)
      expect(
        sqlite
          .prepare('SELECT version FROM operations_projects WHERE id=?')
          .get(project.id)?.version,
      ).toBe(1)
    } finally {
      sqlite.close()
    }
  })
})

describe('Operations asset storage', () => {
  it('uploads and serves a private project file and denies another tenant', async () => {
    const { sqlite, env } = setup([
      { id: 'admin-a', tenantId: 'tenant-a', role: 'admin' },
      { id: 'admin-b', tenantId: 'tenant-b', role: 'admin' },
    ])
    const files = new Map<string, Uint8Array>()
    env.ASSETS_BUCKET = {
      put: async (key: string, value: Uint8Array) => {
        files.set(key, value)
      },
      get: async (key: string) =>
        files.has(key)
          ? {
              body: new Blob([files.get(key)!]).stream(),
              httpMetadata: { contentType: 'image/png' },
            }
          : null,
    }
    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const create = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Private assets' }),
        }),
        env,
        makeCtx(),
      )
      const { project } = await create.json<any>()
      const upload = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects/${project.id}/files`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'image/png',
            'X-File-Name': 'Condo.png',
          },
          body: new Uint8Array([137, 80, 78, 71]),
        }),
        env,
        makeCtx(),
      )
      expect(upload.status).toBe(200)
      const { data } = await upload.json<any>()
      expect(data.asset.name).toBe('Condo.png')
      expect(files.size).toBe(1)
      const file = await handler.fetch(
        new Request(BASE_URL + data.asset.url, { headers: { Cookie: cookie } }),
        env,
        makeCtx(),
      )
      expect(file.status).toBe(200)
      expect(file.headers.get('Cache-Control')).toContain('private')
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(
        new Uint8Array([137, 80, 78, 71]),
      )
      const otherCookie = await createSessionCookie(
        'admin-b',
        'tenant-b',
        'admin',
      )
      const denied = await handler.fetch(
        new Request(BASE_URL + data.asset.url, {
          headers: { Cookie: otherCookie },
        }),
        env,
        makeCtx(),
      )
      expect(denied.status).toBe(404)
      const badType = await handler.fetch(
        new Request(`${BASE_URL}/api/operations/projects/${project.id}/files`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'text/html' },
          body: '<script>example</script>',
        }),
        env,
        makeCtx(),
      )
      expect(badType.status).toBe(400)
      expect(files.size).toBe(1)
    } finally {
      sqlite.close()
    }
  })
})

describe('Operations collaboration and linked record search', () => {
  it('searches full client names and excludes other tenants and inactive records', async () => {
    const { sqlite, env } = setup([
      { id: 'admin-a', tenantId: 'tenant-a', role: 'admin' },
      { id: 'admin-b', tenantId: 'tenant-b', role: 'admin' },
    ])
    try {
      sqlite.exec(
        "INSERT INTO contacts(id,tenant_id,is_active,first_name,last_name,email) VALUES('mine','tenant-a',1,'Enisa','Pjetrovic','enisa@example.test'),('other','tenant-b',1,'Enisa','Pjetrovic','private@example.test'),('inactive','tenant-a',0,'Enisa','Pjetrovic','old@example.test')",
      )
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const response = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/records?type=contact&q=Enisa%20Pjetrovic`,
          { headers: { Cookie: cookie } },
        ),
        env,
        makeCtx(),
      )
      expect(response.status).toBe(200)
      expect(
        (await response.json<any>()).data.records.map(
          (record: any) => record.id,
        ),
      ).toEqual(['mine'])
      const foreign = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/records?type=contact&id=other`,
          { headers: { Cookie: cookie } },
        ),
        env,
        makeCtx(),
      )
      expect((await foreign.json<any>()).data.records).toEqual([])
    } finally {
      sqlite.close()
    }
  })
  it('resolves the Inventory listing bundle and sends tenant identity', async () => {
    const { sqlite, env } = setup()
    env.INVENTORY_WORKER_URL = 'https://inventory.example.test'
    env.INTERNAL_API_SECRET = 'internal-test'
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({
          project: {
            id: 'listing-1',
            tenantId: 'tenant-a',
            name: 'Condo',
            data: { streetAddress: '123 Main Street', city: 'New York' },
          },
        }),
      )
    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const response = await handler.fetch(
        new Request(
          `${BASE_URL}/api/operations/records?type=listing&id=listing-1`,
          { headers: { Cookie: cookie } },
        ),
        env,
        makeCtx(),
      )
      expect(response.status).toBe(200)
      expect((await response.json<any>()).data.records).toEqual([
        { id: 'listing-1', label: '123 Main Street', detail: 'New York' },
      ])
      expect(fetchMock).toHaveBeenCalledWith(
        'https://inventory.example.test/api/listings/listing-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Tenant-Id': 'tenant-a',
            'X-User-Id': 'admin-a',
          }),
        }),
      )
    } finally {
      fetchMock.mockRestore()
      sqlite.close()
    }
  })
  it('preserves link assets and tags and validates collaborators before saving', async () => {
    const { sqlite, env } = setup([
      { id: 'admin-a', tenantId: 'tenant-a', role: 'admin' },
      { id: 'agent-a', tenantId: 'tenant-a', role: 'salesperson' },
      { id: 'agent-b', tenantId: 'tenant-b', role: 'salesperson' },
    ])
    try {
      const cookie = await createSessionCookie('admin-a', 'tenant-a', 'admin')
      const { project } = await (
        await request(env, cookie, '/projects', {
          name: 'Signed listing',
          currentStage: 'Listing Agreement Signed',
          workflow: { collaboratorIds: ['agent-a'] },
          assets: [
            {
              id: 'agreement',
              name: 'Signed agreement',
              kind: 'link',
              url: 'https://drive.google.com/file/d/example/view',
              tags: ['agreement', 'signed'],
              hero: false,
            },
          ],
        })
      ).json<any>()
      expect(project.currentStage).toBe('Listing Agreement Signed')
      expect(project.assets[0].tags).toEqual(['agreement', 'signed'])
      expect(project.workflow.collaboratorIds).toEqual(['agent-a'])
      const wrongTenant = await update(env, cookie, project.id, {
        version: 1,
        workflow: { collaboratorIds: ['agent-b'] },
      })
      expect(wrongTenant.status).toBe(400)
      const badTags = await update(env, cookie, project.id, {
        version: 1,
        assets: [{ ...project.assets[0], tags: [42] }],
      })
      expect(badTags.status).toBe(400)
      const saved = await update(env, cookie, project.id, {
        version: 1,
        currentStage: 'Closed',
        assets: [{ ...project.assets[0], tags: ['agreement', 'mls'] }],
      })
      expect(saved.status).toBe(200)
      const next = (await saved.json<any>()).data.project
      expect(next.currentStage).toBe('Closed')
      expect(next.assets[0].tags).toEqual(['agreement', 'mls'])
    } finally {
      sqlite.close()
    }
  })
})
