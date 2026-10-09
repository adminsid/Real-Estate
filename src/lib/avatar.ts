/** Accept existing public photo URLs, application paths, or stored R2 avatar keys. */
export function avatarUrl(value?: string | null): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  if (raw.includes('/avatars/') && !raw.includes('://')) return `/api/auth/avatar/${encodeURIComponent(raw)}`
  return undefined
}
