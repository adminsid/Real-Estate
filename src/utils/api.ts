export class ApiError extends Error {
  status: number
  route: string
  constructor(message: string, status: number, route: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.route = route
  }
}

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
    console.error('Session expired or unauthorized')
  }

  // Check content-type before parsing JSON
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    // Read truncated text body for non-JSON errors
    const text = await res.text().catch(() => '')
    const truncated = text.slice(0, 200)
    throw new ApiError(
      `Service unavailable (${res.status}): ${truncated || res.statusText}`,
      res.status,
      path
    )
  }

  const data = await res.json().catch(() => null)
  if (!data || !data.success) {
    throw new ApiError(data?.error ?? 'Request failed', res.status, path)
  }
  return data.data as T
}
