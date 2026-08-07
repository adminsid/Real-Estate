import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { CommandPalette } from './CommandPalette'

export function WorkspaceSearch() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <div className="relative hidden md:flex items-center w-72">
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 w-full text-left hover:bg-gray-100/80 transition-colors shadow-2xs group"
        >
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0 group-hover:text-brand-navy transition-colors" />
          <span className="flex-1 text-sm text-gray-400 font-medium">Search or /command...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-bold text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-2xs group-hover:border-brand-navy/30">
            ⌘K
          </kbd>
        </button>
      </div>

      <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}

