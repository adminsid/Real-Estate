import { ExternalLink, ShieldCheck, ArrowLeft, X } from 'lucide-react'

interface ExternalAppBridgeModalProps {
  appName: string
  externalUrl: string
  description?: string
  onClose: () => void
}

export function ExternalAppBridgeModal({ appName, externalUrl, description, onClose }: ExternalAppBridgeModalProps) {
  const handleLaunch = () => {
    window.open(externalUrl, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 border border-gray-100" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="h-12 w-12 rounded-2xl bg-brand-navy/10 text-brand-navy flex items-center justify-center">
            <ExternalLink className="h-6 w-6" />
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
              External Destination
            </span>
            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
              <ShieldCheck className="h-3 w-3" /> Workspace SSO Safe
            </span>
          </div>
          <h3 className="text-lg font-extrabold text-gray-900 leading-tight">Opening {appName}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {description || 'You are leaving the Prime America Workspace environment for an external web service portal.'}
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200/80 text-xs space-y-1 text-gray-600">
          <p className="font-semibold text-gray-800">What to expect:</p>
          <p>• Opens in a new browser tab with single sign-on.</p>
          <p>• Keep this workspace tab open to return seamlessly to your active pipeline.</p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Stay in Workspace
          </button>
          <button
            onClick={handleLaunch}
            className="flex-1 py-3 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy-light shadow-md inline-flex items-center justify-center gap-1.5"
          >
            Launch External Portal <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
