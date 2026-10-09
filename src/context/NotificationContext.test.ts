import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ authenticated: false, loading: false, path: '/', effect: undefined as undefined | (() => void | (() => void)) }))
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useState: () => [[], vi.fn()],
  useEffect: (effect: () => void | (() => void)) => { state.effect = effect },
}))
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: state.path }) }))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ isAuthenticated: state.authenticated, isLoading: state.loading }) }))
import { NotificationProvider } from './NotificationContext'

let sources: Array<{ close: ReturnType<typeof vi.fn>, onerror?: () => void }>
beforeEach(() => {
  vi.useFakeTimers()
  sources = []
  state.authenticated = false; state.loading = false; state.path = '/'
  vi.stubGlobal('EventSource', class { close = vi.fn(); constructor() { sources.push(this) } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function mount() { NotificationProvider({ children: null }); return state.effect?.() }

it('does not open a notification stream while signed out at the root login screen', () => {
  mount()
  expect(sources).toHaveLength(0)
})
it('waits until session loading completes', () => {
  state.authenticated = true; state.loading = true
  mount()
  expect(sources).toHaveLength(0)
})
it('cancels pending reconnects on logout or navigation cleanup', () => {
  state.authenticated = true
  const cleanup = mount()
  expect(sources).toHaveLength(1)
  sources[0].onerror?.()
  expect(vi.getTimerCount()).toBe(1)
  cleanup?.()
  vi.advanceTimersByTime(10000)
  expect(sources).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0)
})
