export async function apiFetch<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...opts?.headers,
    },
    ...opts,
  })

  if (res.status === 401) {
    // Session expired or unauthorized
    console.error('Session expired or unauthorized')
  }

  const data = await res.json()
  if (!data.success) {
    throw new Error(data.error ?? 'Request failed')
  }
  return data.data as T
}
