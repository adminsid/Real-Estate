/** Restrict login continuations to local paths and explicitly trusted HTTPS origins. */
export function getSafeRedirectUrl(value: string | null): string | null {
  if (!value || /[\\\u0000-\u0020]/.test(value) || value.startsWith('//')) return null
  const base = 'https://workspace.primeamericany.com'
  try {
    const url = new URL(value, base)
    if (url.username || url.password) return null
    if (value.startsWith('/')) return url.origin === base ? url.pathname + url.search + url.hash : null
    const origins = [base, 'https://app.primeamericarealestate.com', 'https://inventory.primeamericarealestate.com',
      'https://openhouse.primeamericarealestate.com', 'https://inside.primeamericarealestate.com',
      'https://re-workspace.lama-4db.workers.dev', 'https://prime-america-kb.lama-4db.workers.dev']
    return origins.includes(url.origin) ? url.toString() : null
  } catch { return null }
}
