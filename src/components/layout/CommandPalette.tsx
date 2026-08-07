import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PlusCircle, PhoneCall, Building2, UserPlus, FilePlus,
  ArrowRight, Settings, Loader2, User2, FileText, Network, X, Command, Sparkles
} from 'lucide-react'


interface CommandItem {
  id: string
  command: string
  label: string
  description: string
  icon: any
  action: () => void
  category: 'action' | 'navigation'
}

interface SearchResults {
  contacts?: any[]
  transactions?: any[]
  listings?: any[]
  network?: any[]
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onOpenNewDeal?: () => void
  onOpenNewContact?: () => void
  onOpenNewListing?: () => void
  onOpenNewConnection?: () => void
}

export function CommandPalette({
  isOpen,
  onClose,
  onOpenNewDeal,
  onOpenNewContact,
  onOpenNewListing,
  onOpenNewConnection,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults(null)
      setFocusedIndex(0)
    }
  }, [isOpen])

  // Slash commands registry
  const availableCommands: CommandItem[] = [
    {
      id: 'cmd-new-deal',
      command: '/new-deal',
      label: 'Create New Deal',
      description: 'Start a new transaction or pipeline deal card',
      icon: PlusCircle,
      category: 'action',
      action: () => {
        onClose()
        if (onOpenNewDeal) {
          onOpenNewDeal()
        } else {
          navigate('/transactions?action=new-deal')
        }
      },
    },
    {
      id: 'cmd-log-call',
      command: '/log-call',
      label: 'Log Call',
      description: 'Record a phone call interaction with a contact',
      icon: PhoneCall,
      category: 'action',
      action: () => {
        onClose()
        navigate('/marketing/crm?action=log-call')
      },
    },
    {
      id: 'cmd-open-mls',
      command: '/open-mls',
      label: 'Open MLS Listings',
      description: 'Search live inventory and MLS property listings',
      icon: Building2,
      category: 'navigation',
      action: () => {
        onClose()
        navigate('/inventory/mls')
      },
    },
    {
      id: 'cmd-new-contact',
      command: '/new-contact',
      label: 'Add New Contact',
      description: 'Create a new CRM lead, buyer, or seller contact',
      icon: UserPlus,
      category: 'action',
      action: () => {
        onClose()
        if (onOpenNewContact) {
          onOpenNewContact()
        } else {
          navigate('/marketing/crm?action=new-contact')
        }
      },
    },
    {
      id: 'cmd-add-listing',
      command: '/add-listing',
      label: 'Create Listing Draft',
      description: 'Submit a new property listing for admin review',
      icon: FilePlus,
      category: 'action',
      action: () => {
        onClose()
        if (onOpenNewListing) {
          onOpenNewListing()
        } else {
          navigate('/inventory?action=add-listing')
        }
      },
    },
    {
      id: 'cmd-referral',
      command: '/referral',
      label: 'Refer Client to Network',
      description: 'Create a tracked referral handshake to vendor or agent',
      icon: Network,
      category: 'action',
      action: () => {
        onClose()
        if (onOpenNewConnection) {
          onOpenNewConnection()
        } else {
          navigate('/network?action=referral')
        }
      },
    },
    {
      id: 'cmd-settings',
      command: '/settings',
      label: 'Workspace Settings',
      description: 'Manage permissions, RLS policies, and preferences',
      icon: Settings,
      category: 'navigation',
      action: () => {
        onClose()
        navigate('/settings')
      },
    },
  ]

  // Filter commands by query
  const filteredCommands = availableCommands.filter((cmd) => {
    const q = query.toLowerCase().trim()
    if (!q) return true
    if (q.startsWith('/')) {
      return cmd.command.toLowerCase().includes(q) || cmd.label.toLowerCase().includes(q.slice(1))
    }
    return cmd.command.toLowerCase().includes(q) || cmd.label.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q)
  })

  // Perform backend search for non-slash queries
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2 || q.startsWith('/')) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      if (json.success) {
        setResults(json.data)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query || query.startsWith('/')) {
      setResults(null)
      return
    }
    debounceRef.current = setTimeout(() => doSearch(query), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, doSearch])

  // Flattened results for keyboard navigation
  type FlatItem =
    | { kind: 'command'; item: CommandItem }
    | { kind: 'contact'; item: any }
    | { kind: 'transaction'; item: any }
    | { kind: 'listing'; item: any }
    | { kind: 'network'; item: any }

  const flatList: FlatItem[] = []

  // Add matching commands
  filteredCommands.forEach((cmd) => flatList.push({ kind: 'command', item: cmd }))

  // Add search results if query is not slash command
  if (results && !query.startsWith('/')) {
    results.contacts?.slice(0, 4).forEach((c) => flatList.push({ kind: 'contact', item: c }))
    results.transactions?.slice(0, 4).forEach((t) => flatList.push({ kind: 'transaction', item: t }))
    results.listings?.slice(0, 4).forEach((l) => flatList.push({ kind: 'listing', item: l }))
    results.network?.slice(0, 4).forEach((n) => flatList.push({ kind: 'network', item: n }))
  }

  const handleSelect = (item: FlatItem) => {
    if (item.kind === 'command') {
      item.item.action()
    } else if (item.kind === 'contact') {
      onClose()
      navigate(`/marketing/crm/${item.item.id}`)
    } else if (item.kind === 'transaction') {
      onClose()
      navigate(`/transactions/${item.item.id}`)
    } else if (item.kind === 'listing') {
      onClose()
      navigate(`/inventory/listings/${item.item.id}`)
    } else if (item.kind === 'network') {
      onClose()
      navigate(`/network/${item.item.id}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((prev) => (flatList.length > 0 ? (prev + 1) % flatList.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((prev) => (flatList.length > 0 ? (prev - 1 + flatList.length) % flatList.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatList[focusedIndex]) {
        handleSelect(flatList[focusedIndex])
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[80vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-brand-navy/10 text-brand-navy mr-3">
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-brand-gold" /> : <Command className="h-4 w-4 text-brand-navy" />}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setFocusedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command (/new-deal, /open-mls) or search..."
            className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-base focus:outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults(null)
              }}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 mr-2"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-md shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Command Body */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-gray-100">
          {/* Actionable Commands Section */}
          {filteredCommands.length > 0 && (
            <div className="py-2">
              <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                <span>Action Commands</span>
                <span className="text-[10px] text-gray-400 font-normal">Type / to filter</span>
              </div>
              <div className="mt-1 space-y-1">
                {filteredCommands.map((cmd) => {
                  const itemIndex = flatList.findIndex((f) => f.kind === 'command' && f.item.id === cmd.id)
                  const isSelected = itemIndex === focusedIndex
                  const Icon = cmd.icon

                  return (
                    <button
                      key={cmd.id}
                      onClick={() => handleSelect({ kind: 'command', item: cmd })}
                      onMouseEnter={() => setFocusedIndex(itemIndex)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                        isSelected ? 'bg-brand-navy text-white shadow-md' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${isSelected ? 'bg-white/20 text-brand-gold' : 'bg-gray-100 text-gray-600'}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{cmd.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                              isSelected ? 'bg-white/20 text-brand-gold' : 'bg-gray-200 text-gray-700'
                            }`}>
                              {cmd.command}
                            </span>
                          </div>
                          <p className={`text-xs truncate ${isSelected ? 'text-gray-200' : 'text-gray-500'}`}>
                            {cmd.description}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-brand-gold' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search Results Section */}
          {results && !query.startsWith('/') && (
            <div className="py-2">
              <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-400">
                Workspace Search Results
              </div>

              {/* Contacts */}
              {results.contacts && results.contacts.length > 0 && (
                <div className="mt-1">
                  <div className="px-3 py-1 text-[11px] font-semibold text-sky-600">Contacts</div>
                  {results.contacts.map((c) => {
                    const idx = flatList.findIndex((f) => f.kind === 'contact' && f.item.id === c.id)
                    const isSelected = idx === focusedIndex
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelect({ kind: 'contact', item: c })}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${
                          isSelected ? 'bg-sky-600 text-white' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <User2 className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-sky-500'}`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{c.first_name} {c.last_name}</span>
                          <span className={`text-xs truncate block ${isSelected ? 'text-sky-100' : 'text-gray-400'}`}>
                            {c.email || c.phone || 'Contact'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Deals */}
              {results.transactions && results.transactions.length > 0 && (
                <div className="mt-1">
                  <div className="px-3 py-1 text-[11px] font-semibold text-emerald-600">Deals</div>
                  {results.transactions.map((t) => {
                    const idx = flatList.findIndex((f) => f.kind === 'transaction' && f.item.id === t.id)
                    const isSelected = idx === focusedIndex
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleSelect({ kind: 'transaction', item: t })}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${
                          isSelected ? 'bg-emerald-600 text-white' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <FileText className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-emerald-500'}`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{t.name}</span>
                          <span className={`text-xs truncate block ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>
                            {t.type} · ${t.price ? Number(t.price).toLocaleString() : '0'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Listings */}
              {results.listings && results.listings.length > 0 && (
                <div className="mt-1">
                  <div className="px-3 py-1 text-[11px] font-semibold text-amber-600">MLS Listings</div>
                  {results.listings.map((l) => {
                    const idx = flatList.findIndex((f) => f.kind === 'listing' && f.item.id === l.id)
                    const isSelected = idx === focusedIndex
                    return (
                      <button
                        key={l.id}
                        onClick={() => handleSelect({ kind: 'listing', item: l })}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${
                          isSelected ? 'bg-amber-600 text-white' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <Building2 className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-amber-500'}`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{l.address || l.title || 'Listing'}</span>
                          <span className={`text-xs truncate block ${isSelected ? 'text-amber-100' : 'text-gray-400'}`}>
                            {l.city}, {l.state} · ${l.price ? Number(l.price).toLocaleString() : 'N/A'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* No results fallback */}
          {flatList.length === 0 && !loading && (
            <div className="py-12 text-center text-gray-400">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-gray-300 animate-pulse" />
              <p className="text-sm font-medium text-gray-600">No matching commands or results</p>
              <p className="text-xs text-gray-400 mt-1">Try searching for contacts, listing addresses, or slash commands like /new-deal</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded shadow-2xs font-semibold">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded shadow-2xs font-semibold">↵</kbd> Execute</span>
          </div>
          <span className="font-medium text-brand-navy flex items-center gap-1">
            <Command className="h-3 w-3" /> Prime America Command Hub
          </span>
        </div>
      </div>
    </div>
  )
}
