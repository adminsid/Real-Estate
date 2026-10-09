import type { Env } from '../index'
import {
  newTask,
  PROJECT_STAGES,
  normalizeProjectStage,
  safeAssetUrl,
  TASK_STATUSES,
  type ProjectTask,
} from '../../src/domain/operations'
export const OPERATIONS_STAGE_OPTIONS = new Set<string>([
  ...PROJECT_STAGES,
  'Marketing Plan',
  'Launch',
  'Under Contract',
  'Closing',
  'Completed',
])
export const OPERATIONS_STATUS_OPTIONS = new Set([
  'Active',
  'Paused',
  'Delayed',
  'Complete',
])
const OPERATIONS_TASK_STATUS_OPTIONS = new Set<string>(TASK_STATUSES)
const OPERATIONS_LINK_ID_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/

type LinkValidationError = { message: string; status: number }

export function validateBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
  allowEmpty = true,
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return `${field} must be a string`
  const trimmed = value.trim()
  if (!allowEmpty && !trimmed) return `${field} is required`
  if (trimmed.length > maxLength)
    return `${field} must be ${maxLength} characters or fewer`
  return null
}

export function validateIsoDateString(
  value: unknown,
  field: string,
): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return `${field} must be a date string`
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return `${field} must be a valid date`
  return null
}

export function validateOperationsTasks(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return 'tasks must be an array'
  if (value.length > 250) return 'tasks cannot exceed 250 records'

  for (const task of value) {
    if (!task || typeof task !== 'object') return 'Each task must be an object'
    const taskValue = task as Record<string, unknown>

    if (typeof taskValue.title !== 'string' || !taskValue.title.trim())
      return 'task.title is required'
    const titleError = validateBoundedString(
      taskValue.title,
      'task.title',
      240,
      false,
    )
    if (titleError) return titleError

    const ownerError = validateBoundedString(taskValue.owner, 'task.owner', 120)
    if (ownerError) return ownerError

    const dueDateError = validateIsoDateString(
      taskValue.dueDate,
      'task.dueDate',
    )
    if (dueDateError) return dueDateError

    if (taskValue.status !== undefined) {
      if (
        typeof taskValue.status !== 'string' ||
        !OPERATIONS_TASK_STATUS_OPTIONS.has(taskValue.status)
      ) {
        return `task.status must be one of: ${Array.from(OPERATIONS_TASK_STATUS_OPTIONS).join(', ')}`
      }
    }
  }

  return null
}

export function validateOperationsComments(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return 'comments must be an array'
  if (value.length > 500) return 'comments cannot exceed 500 records'

  for (const comment of value) {
    if (!comment || typeof comment !== 'object')
      return 'Each comment must be an object'
    const commentValue = comment as Record<string, unknown>

    const authorError = validateBoundedString(
      commentValue.author,
      'comment.author',
      120,
    )
    if (authorError) return authorError

    const messageError = validateBoundedString(
      commentValue.message,
      'comment.message',
      5000,
      false,
    )
    if (messageError) return messageError
  }

  return null
}

export function canAccessOperationsWorkspace(role: string): boolean {
  return ['admin', 'broker', 'salesperson'].includes(role)
}

export async function validateOperationsLinks(
  env: Env,
  tenantId: string,
  links: { dealId?: string; crmContactId?: string; listingId?: string },
  session?: { userId: string; role: string },
): Promise<LinkValidationError | null> {
  if (links.dealId) {
    if (!OPERATIONS_LINK_ID_PATTERN.test(links.dealId)) {
      return { message: 'dealId is invalid', status: 400 }
    }
    const deal = await env.DB.prepare(
      'SELECT id FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1',
    )
      .bind(links.dealId, tenantId)
      .first<{ id: string }>()
    if (!deal) {
      return {
        message: 'dealId does not reference an active transaction',
        status: 404,
      }
    }
  }

  if (links.crmContactId) {
    if (!OPERATIONS_LINK_ID_PATTERN.test(links.crmContactId)) {
      return { message: 'crmContactId is invalid', status: 400 }
    }
    const contact = await env.DB.prepare(
      'SELECT id FROM contacts WHERE id = ? AND tenant_id = ? AND is_active = 1',
    )
      .bind(links.crmContactId, tenantId)
      .first<{ id: string }>()
    if (!contact) {
      return {
        message: 'crmContactId does not reference an active contact',
        status: 404,
      }
    }
  }

  if (links.listingId) {
    if (!OPERATIONS_LINK_ID_PATTERN.test(links.listingId)) {
      return { message: 'listingId is invalid', status: 400 }
    }

    // Verify via inventory service when bindings are available in this environment.
    if (env.INVENTORY_WORKER_URL && env.INTERNAL_API_SECRET && session) {
      try {
        const response = await fetch(
          `${env.INVENTORY_WORKER_URL}/api/listings/${encodeURIComponent(links.listingId)}`,
          {
            headers: {
              Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
              'X-User-Id': session.userId,
              'X-Tenant-Id': tenantId,
              'X-User-Role': session.role,
            },
          },
        )

        if (response.status === 404) {
          return {
            message: 'listingId does not reference an accessible listing',
            status: 404,
          }
        }

        if (!response.ok) {
          return {
            message: 'Unable to verify listingId against listing service',
            status: 503,
          }
        }
      } catch {
        return {
          message: 'Unable to verify listingId against listing service',
          status: 503,
        }
      }
    }
  }

  return null
}
export function validateAssetReferences(
  value: unknown,
  assets: Array<{ id: string }>,
) {
  if (!Array.isArray(value)) return null
  for (const task of value)
    if (
      Array.isArray(task.assetIds) &&
      task.assetIds.some((id: string) => !assets.some((a) => a.id === id))
    )
      return 'Attach assets from this project only'
  return null
}
export function taskFromInput(input: Record<string, unknown>): ProjectTask {
  return {
    ...newTask(),
    ...input,
    phase: normalizeProjectStage(String(input.phase || 'Marketing')),
    id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
    title: String(input.title || '').trim(),
  } as ProjectTask
}
export function validateDetails(body: Record<string, unknown>): string | null {
  for (const key of ['dealId', 'listingId', 'crmContactId'])
    if (
      body[key] !== undefined &&
      (typeof body[key] !== 'string' ||
        (body[key] && !OPERATIONS_LINK_ID_PATTERN.test(String(body[key]))))
    )
      return `${key} is invalid`
  if (body.workflow !== undefined) {
    if (
      !body.workflow ||
      typeof body.workflow !== 'object' ||
      Array.isArray(body.workflow)
    )
      return 'workflow must be an object'
    const w = body.workflow as Record<string, unknown>
    if (
      w.collaboratorIds !== undefined &&
      (!Array.isArray(w.collaboratorIds) ||
        w.collaboratorIds.length > 50 ||
        w.collaboratorIds.some(
          (id: unknown) =>
            typeof id !== 'string' || !OPERATIONS_LINK_ID_PATTERN.test(id),
        ))
    )
      return 'Invalid project collaborators'

    for (const key of [
      'launchDate',
      'contractDate',
      'closingDate',
      'mlsListingDate',
      'clearCooperationDueDate',
      'originalListingDate',
    ]) {
      const error = validateIsoDateString(w[key], key)
      if (error) return error
    }
    if (
      w.mlsEnteredAt !== undefined &&
      w.mlsEnteredAt !== '' &&
      (typeof w.mlsEnteredAt !== 'string' ||
        w.mlsEnteredAt.length > 40 ||
        !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(w.mlsEnteredAt) ||
        !Number.isFinite(Date.parse(w.mlsEnteredAt)))
    )
      return 'MLS entry must be a valid timestamp with a time zone'
    if (validateBoundedString(w.agreementReference, 'agreementReference', 500))
      return 'Agreement reference is too long'
    if (
      w.result &&
      !['sold', 'leased', 'withdrawn', 'expired', 'cancelled'].includes(
        String(w.result),
      )
    )
      return 'Project result is invalid'
  }
  if (body.assets !== undefined) {
    if (!Array.isArray(body.assets) || body.assets.length > 100)
      return 'assets must contain at most 100 records'
    const ids = new Set<string>()
    for (const a of body.assets) {
      if (
        !a ||
        typeof a !== 'object' ||
        typeof a.id !== 'string' ||
        !OPERATIONS_LINK_ID_PATTERN.test(a.id) ||
        ids.has(a.id)
      )
        return 'Asset IDs must be valid and unique'
      ids.add(a.id)
      if (
        a.tags !== undefined &&
        (!Array.isArray(a.tags) ||
          a.tags.length > 20 ||
          a.tags.some(
            (tag: unknown) =>
              typeof tag !== 'string' || !tag.trim() || tag.length > 40,
          ))
      )
        return 'Use at most 20 asset tags, each 1–40 characters'
      if (
        typeof a.name !== 'string' ||
        !a.name.trim() ||
        a.name.length > 240 ||
        !['photo', 'flyer', 'video', 'document', 'link'].includes(a.kind)
      )
        return 'Asset name or kind is invalid'
      if (
        typeof a.url !== 'string' ||
        a.url.length > 2000 ||
        !safeAssetUrl(a.url)
      )
        return 'Asset URLs must use HTTPS or a project file link'
    }
  }
  if (Array.isArray(body.tasks)) {
    const ids = new Set<string>()
    for (const raw of body.tasks) {
      if (!raw || typeof raw !== 'object') return 'Each task must be an object'
      const t = raw as Record<string, unknown>
      if (
        t.id !== undefined &&
        (typeof t.id !== 'string' ||
          !OPERATIONS_LINK_ID_PATTERN.test(t.id) ||
          ids.has(t.id))
      )
        return 'Task IDs must be valid and unique'
      if (typeof t.id === 'string') ids.add(t.id)
      for (const key of ['description', 'caption']) {
        const error = validateBoundedString(t[key], key, 5000)
        if (error) return error
      }
      for (const key of [
        'ownerId',
        'approverId',
        'blockedBy',
        'presetKey',
        'platform',
      ]) {
        const error = validateBoundedString(t[key], key, 120)
        if (error) return error
      }
      if (
        t.phase !== undefined &&
        !OPERATIONS_STAGE_OPTIONS.has(String(t.phase))
      )
        return 'Task phase is invalid'
      if (
        t.requiresApproval !== undefined &&
        typeof t.requiresApproval !== 'boolean'
      )
        return 'requiresApproval must be a boolean'
      const dateError = validateIsoDateString(t.publishDate, 'publishDate')
      if (dateError) return dateError
      if (
        t.publicationStatus !== undefined &&
        !['planned', 'scheduled', 'published'].includes(
          String(t.publicationStatus),
        )
      )
        return 'Publication status is invalid'
      if (
        t.schedulerUrl &&
        (typeof t.schedulerUrl !== 'string' ||
          t.schedulerUrl.length > 2000 ||
          !safeAssetUrl(t.schedulerUrl))
      )
        return 'Scheduling links must use HTTPS'
      if (
        t.assetIds !== undefined &&
        (!Array.isArray(t.assetIds) ||
          t.assetIds.length > 100 ||
          t.assetIds.some((id) => typeof id !== 'string'))
      )
        return 'Asset references are invalid'
    }
    for (const t of body.tasks as Array<Record<string, unknown>>) {
      if (
        t.blockedBy &&
        (!ids.has(String(t.blockedBy)) || t.blockedBy === t.id)
      )
        return 'Blocking task must be another task in this project'
      const seen = new Set<string>()
      let cursor = t
      while (cursor.blockedBy) {
        if (seen.has(String(cursor.blockedBy)))
          return 'Task dependencies cannot form a cycle'
        seen.add(String(cursor.blockedBy))
        cursor = (body.tasks as Array<Record<string, unknown>>).find(
          (x) => x.id === cursor.blockedBy,
        )!
      }
    }
  }
  return null
}
export async function validateAssignments(
  env: Env,
  tenantId: string,
  value: unknown,
  collaboratorIds: string[] = [],
) {
  const ids = new Set<string>(collaboratorIds)
  for (const task of Array.isArray(value) ? value : [])
    for (const key of ['ownerId', 'approverId'])
      if (task[key]) ids.add(task[key])
  for (const id of ids) {
    if (!OPERATIONS_LINK_ID_PATTERN.test(id)) return 'Invalid team member'
    const row = await env.DB.prepare(
      "SELECT id FROM users WHERE id=? AND tenant_id=? AND is_active=1 AND role IN ('admin','broker','salesperson')",
    )
      .bind(id, tenantId)
      .first()
    if (!row) return 'Team members must be active users in this workspace'
  }
  return null
}
