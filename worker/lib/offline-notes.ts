import type { D1Database } from '@cloudflare/workers-types'
export async function saveOfflineNote(db: D1Database, tenantId: string, userId: string, input: {
  commandId?: string; tenantId?: string; actorId?: string; occurredAt?: string; text?: string; expectedVersion?: number;
}): Promise<Response> {
  if (input.tenantId !== tenantId || input.actorId !== userId) return Response.json({ error: 'Sign in to the account that saved this note' }, { status: 403 })
  if (!input.commandId || !/^[a-zA-Z0-9-]{1,80}$/.test(input.commandId) || input.expectedVersion !== 0
    || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 10000
    || !input.occurredAt || !Number.isFinite(Date.parse(input.occurredAt))) return Response.json({ error: 'Invalid note command' }, { status: 400 })
  await db.prepare(`INSERT OR IGNORE INTO personal_notes (id,tenant_id,user_id,body,occurred_at)
    VALUES (?,?,?,?,?)`).bind(input.commandId,tenantId,userId,input.text,input.occurredAt).run()
  const saved = await db.prepare('SELECT body,occurred_at FROM personal_notes WHERE id=? AND tenant_id=? AND user_id=?')
    .bind(input.commandId,tenantId,userId).first<{ body: string; occurred_at: string }>()
  if (!saved || saved.body !== input.text || saved.occurred_at !== input.occurredAt) return Response.json({ error: 'Command conflict; keep the local note for review' }, { status: 409 })
  return Response.json({ success: true, id: input.commandId, state: 'server_saved' })
}
