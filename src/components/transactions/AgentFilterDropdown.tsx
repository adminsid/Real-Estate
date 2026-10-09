import { UserAvatar } from '@/components/common/UserAvatar'
import { useAuth } from '@/context/AuthContext'
import { useState, useRef, useEffect } from 'react'
import { Users, ChevronDown, X, UserX } from 'lucide-react'
import clsx from 'clsx'

interface AgentOption {
  id: string
  name: string
  role: string
  avatarUrl?: string
  avatar_url?: string
}

interface AgentFilterDropdownProps {
  users: AgentOption[]
  value: string
  onChange: (value: string) => void
  dealCountByAgent: Record<string, number>
  currentUserId?: string
  allLabel?: string
  mineLabel?: string
  countNoun?: string
  includeUnassigned?: boolean
}

export function AgentFilterDropdown({
  users,
  value,
  onChange,
  dealCountByAgent,
  currentUserId,
  allLabel = 'All Agents',
  mineLabel = 'My Deals',
  countNoun = 'deals',
  includeUnassigned = false,
}: AgentFilterDropdownProps) {
  const { user: currentUser } = useAuth()
  const me: AgentOption | undefined = currentUser && currentUser.id === currentUserId ? currentUser : users.find(u => u.id === currentUserId)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedUser = value !== 'all' && value !== 'me' && value !== 'unassigned' ? users.find(u => u.id === value) : null
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  )

  const getLabel = () => {
    if (value === 'me') return mineLabel
    if (value === 'unassigned') return 'Unassigned'
    if (selectedUser) return selectedUser.name
    return allLabel
  }

  const isFiltered = value !== 'all'

  return (
    <div ref={ref} className="relative" id="agent-filter-dropdown">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch('') }}
        className={clsx(
          'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none',
          isFiltered
            ? 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-xs'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {isFiltered && value === 'me' ? (
          <UserAvatar name={me?.name} src={me?.avatarUrl || me?.avatar_url} className="h-5 w-5 text-[9px]" />
        ) : selectedUser ? (
          <UserAvatar name={selectedUser.name} src={selectedUser.avatarUrl || selectedUser.avatar_url} className="h-5 w-5 text-[9px]" />
        ) : (
          <Users className="h-3.5 w-3.5 text-gray-500 shrink-0" />
        )}

        <span className="max-w-[100px] truncate">{getLabel()}</span>

        {isFiltered ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange('all'); setOpen(false) }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 transition-colors"
            aria-label="Clear agent filter"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <ChevronDown className={clsx('h-3.5 w-3.5 text-gray-400 transition-transform', open && 'rotate-180')} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Filter agents..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-400"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {/* All Agents */}
            {!search && (
              <>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === 'all'}
                  onClick={() => { onChange('all'); setOpen(false) }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-gray-50',
                    value === 'all' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                  )}
                >
                  <Users className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="flex-1 text-left">{allLabel}</span>
                  <span className="text-[10px] font-bold text-gray-400">{Object.values(dealCountByAgent).reduce((a, b) => a + b, 0)} {countNoun}</span>
                </button>

                {/* Assigned to me */}
                {currentUserId && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === 'me'}
                    onClick={() => { onChange('me'); setOpen(false) }}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-gray-50',
                      value === 'me' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                    )}
                  >
                    <UserAvatar name={me?.name} src={me?.avatarUrl || me?.avatar_url} className="h-5 w-5 text-[9px]" />
                    <span className="flex-1 text-left font-medium">{mineLabel}</span>
                    <span className="text-[10px] font-bold text-blue-600">{dealCountByAgent[currentUserId] ?? 0} {countNoun}</span>
                  </button>
                )}

                {includeUnassigned ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === 'unassigned'}
                    onClick={() => { onChange('unassigned'); setOpen(false) }}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-gray-50',
                      value === 'unassigned' ? 'bg-amber-50 text-amber-800 font-semibold' : 'text-gray-700'
                    )}
                  >
                    <UserX className="h-4 w-4 text-amber-500 shrink-0" />
                    <span className="flex-1 text-left">Unassigned</span>
                  </button>
                ) : null}

                <div className="mx-3 my-1 border-t border-gray-100" />
              </>
            )}

            {/* Agent List */}
            {filteredUsers.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-400 italic text-center">No agents found</div>
            )}
            {filteredUsers.map(u => {
              const count = dealCountByAgent[u.id] ?? 0
              const isSelected = value === u.id
              return (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(u.id); setOpen(false); setSearch('') }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-gray-50',
                    isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                  )}
                >
                  <UserAvatar name={u.name} src={u.avatarUrl || u.avatar_url} className="h-6 w-6 text-[9px]" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-semibold truncate">{u.name}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{u.role}</p>
                  </div>
                  <span className={clsx(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    count > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  )}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
