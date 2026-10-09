import type { D1Database, KVNamespace } from '@cloudflare/workers-types'
import { hashPassword } from './crypto'

export async function storePasswordResetToken(kv: KVNamespace, token: string, user: { id: string; email: string }, ttl: number): Promise<void> {
  // Bind proof of inbox access to the address that received this particular token.
  await kv.put(`reset:${token}`, JSON.stringify({ userId: user.id, email: user.email }), { expirationTtl: ttl })
}

export async function completePasswordReset(db: D1Database, kv: KVNamespace, token: string, password: string): Promise<boolean> {
  const key = `reset:${token}`
  const value = await kv.get(key)
  if (!value) return false
  await kv.delete(key)

  let identity: { userId: string; email: string } | null = null
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed.userId !== 'string' || typeof parsed.email !== 'string') return false
      identity = parsed
    } catch { return false }
  }

  const passwordHash = await hashPassword(password)
  // Older tokens contain only a user ID. Preserve reset access for already-verified
  // users, but never treat these unbound tokens as proof of a current email address.
  const updated = identity
    ? await db.prepare("UPDATE users SET password_hash = ?, email_verified = 1, updated_at = datetime('now') WHERE id = ? AND email = ? AND is_active = 1 RETURNING id")
      .bind(passwordHash, identity.userId, identity.email).first<{ id: string }>()
    : await db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ? AND email_verified = 1 AND is_active = 1 RETURNING id")
      .bind(passwordHash, value).first<{ id: string }>()
  return Boolean(updated)
}
