import type { Env } from '../index'

type RecordOption = { id: string; label: string; detail: string }
export async function searchOperationsRecords(
  request: Request,
  env: Env,
  session: { userId: string; tenantId: string; role: string },
) {
  const params = new URL(request.url).searchParams
  const type = params.get('type'),
    q = (params.get('q') || '').trim().slice(0, 120),
    id = params.get('id') || ''
  if (!['contact', 'listing', 'deal'].includes(type || ''))
    return Response.json(
      { success: false, error: 'Choose a record type' },
      { status: 400 },
    )
  if (id && !/^[A-Za-z0-9:_-]{1,120}$/.test(id))
    return Response.json(
      { success: false, error: 'Invalid record ID' },
      { status: 400 },
    )
  if (!id && q.length < 2)
    return Response.json({ success: true, data: { records: [] } })
  let records: RecordOption[]
  if (type === 'listing') {
    if (!env.INVENTORY_WORKER_URL)
      return Response.json(
        { success: false, error: 'Inventory is unavailable' },
        { status: 503 },
      )
    const response = await fetch(
      `${env.INVENTORY_WORKER_URL}/api/listings${id ? `/${encodeURIComponent(id)}` : ''}`,
      {
        headers: {
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
          'X-Tenant-Id': session.tenantId,
          'X-User-Id': session.userId,
          'X-User-Role': session.role,
        },
      },
    )
    if (!response.ok)
      return Response.json(
        { success: false, error: 'Unable to load Inventory records' },
        { status: response.status },
      )
    const json = (await response.json()) as {
      listings?: unknown[]
      listing?: unknown
      project?: unknown
      data?: unknown
    }
    const raw = id
      ? [json.project || json.listing || json.data || json]
      : json.listings || json.data || json
    if (!Array.isArray(raw))
      return Response.json(
        { success: false, error: 'Unexpected Inventory response' },
        { status: 502 },
      )
    records = raw
      .filter(
        (item): item is Record<string, unknown> =>
          !!item &&
          typeof item === 'object' &&
          (!('tenantId' in item) || item.tenantId === session.tenantId),
      )
      .map((item) => {
        const data = (item.data || {}) as Record<string, unknown>
        return {
          id: String(item.id || ''),
          label: String(
            item.address || data.streetAddress || item.name || 'Listing',
          ),
          detail: String(item.city || data.city || ''),
        }
      })
      .filter(
        (item) =>
          item.id &&
          (id ||
            `${item.label} ${item.detail}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      )
      .slice(0, 10)
  } else {
    const sql =
      type === 'contact'
        ? `SELECT id, first_name || ' ' || last_name AS label, COALESCE(email, phone, '') AS detail FROM contacts WHERE tenant_id=? AND is_active=1 AND ${id ? 'id=?' : "(first_name || ' ' || last_name LIKE ? OR email LIKE ? OR phone LIKE ?)"} LIMIT 10`
        : `SELECT id, name AS label, status AS detail FROM transactions WHERE tenant_id=? AND is_active=1 AND ${id ? 'id=?' : 'name LIKE ?'} LIMIT 10`
    const query = `%${q}%`
    records = (
      await env.DB.prepare(sql)
        .bind(
          session.tenantId,
          ...(id ? [id] : type === 'contact' ? [query, query, query] : [query]),
        )
        .all<RecordOption>()
    ).results
  }
  return Response.json({ success: true, data: { records } })
}
