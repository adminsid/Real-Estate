import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wifi, WifiOff } from 'lucide-react'

export function ConnectionStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const Icon = online ? Wifi : WifiOff
  return <Link
    to={online ? '/settings?tab=offline' : '/offline'}
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg p-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${online ? 'text-gray-500 hover:bg-gray-50' : 'text-amber-800 bg-amber-50 hover:bg-amber-100'}`}
    aria-label={online ? 'Connection available. Open offline access settings.' : 'Offline. Open saved work on this device.'}
    title={online ? 'Network connection available. Open Offline access to check saved work.' : 'No network connection. Open saved work on this device.'}
  >
    <Icon className="h-4 w-4" aria-hidden="true" />
    <span className="sr-only sm:not-sr-only" role="status">{online ? 'Online' : 'Offline'}</span>
  </Link>
}
