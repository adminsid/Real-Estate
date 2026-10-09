import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Loader2 } from 'lucide-react'

export default function AppIframeShell() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()

  // ── Map appId → target details ─────────────────────────────────────────────
  type AppEntry =
    | { kind: 'embed'; src: string; title: string }
    | { kind: 'external'; url: string; title: string }

  function resolveApp(id: string | undefined): AppEntry {
    switch (id) {
      // Internal embed — served from same origin, OK in iframe
      case 'form-filler':
      case 'tools-form-filler':
        return { kind: 'embed', src: '/tools/form-filler?embed=true', title: 'Interactive Form Filler' }

      // External apps — must open in new tab, NOT iframe
      case 'inventory':
      case 'listing-input':
        return { kind: 'external', url: '/api/sso/redirect?app=listing-input', title: 'Listing Inventory' }
      case 'openhouse':
      case 'open-house':
        return { kind: 'external', url: 'https://openhouse.primeamericarealestate.com', title: 'Open House Portal' }
      case 'branding':
      case 'inside':
      case 'branding-hub':
      case 'brand-hub':
      case 'brand-marketing-hub':
        return { kind: 'external', url: '/api/sso/redirect?app=brand-hub&return_to=%2Fdashboard', title: 'Brand & Marketing Hub' }
      case 'kb':
      case 'cabinet':
      case 'company-brain':
      case 'prime-america-kb':
        return { kind: 'external', url: 'https://prime-america-kb.lama-4db.workers.dev/hub/', title: 'Company Brain KB' }
      case 'transactiondesk':
      case 'transaction-desk':
        return { kind: 'external', url: 'https://pr.transactiondesk.com/', title: 'TransactionDesk' }
      case 'academy':
        return { kind: 'external', url: 'https://primeamerica.theceshop.com/real-estate/', title: 'CE Shop Academy' }
      default:
        return { kind: 'external', url: '#', title: 'App Portal' }
    }
  }

  const app = resolveApp(appId)

  // Open external apps in a new tab and navigate the user back to dashboard
  useEffect(() => {
    if (app.kind === 'external') {
      if (app.url !== '#') {
        window.open(app.url, '_blank', 'noopener,noreferrer')
      }
      // Navigate back — don't leave user on a blank redirect shell
      navigate(-1)
    }
  }, [app, navigate])

  // For external apps the useEffect fires window.open() + navigate(-1); render nothing
  if (app.kind === 'external') {
    return null
  }

  // Embed mode (form-filler only)
  return (
    <Layout title={app.title}>
      <div className="relative w-full h-[calc(100vh-140px)] bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 shadow-inner">
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-10 pointer-events-none" id="iframe-loader">
          <Loader2 className="h-10 w-10 text-brand-navy animate-spin mb-4" />
          <p className="text-sm font-semibold text-gray-600">Loading…</p>
        </div>
        <iframe
          src={app.src}
          className="w-full h-full border-0"
          onLoad={() => {
            const loader = document.getElementById('iframe-loader')
            if (loader) loader.style.display = 'none'
          }}
          allow="geolocation; microphone; camera; midi; encrypted-media; clipboard-write;"
          title={app.title}
        />
      </div>
    </Layout>
  )
}
