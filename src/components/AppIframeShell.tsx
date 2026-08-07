import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Loader2 } from 'lucide-react'

export default function AppIframeShell() {
  const { appId } = useParams<{ appId: string }>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
  }, [appId])

  let targetApp = ''
  let title = 'App Portal'

  if (appId === 'inventory' || appId === 'listing-input') {
    targetApp = 'listing-input'
    title = 'Listing Inventory'
  } else if (appId === 'openhouse' || appId === 'open-house') {
    targetApp = 'open-house'
    title = 'Open House Portal'
  } else if (appId === 'branding' || appId === 'inside' || appId === 'branding-hub') {
    targetApp = 'branding-hub'
    title = 'Brand & Marketing Hub'
  } else if (appId === 'kb' || appId === 'cabinet' || appId === 'company-brain' || appId === 'prime-america-kb') {
    targetApp = 'prime-america-kb'
    title = 'Company Brain KB'
  } else if (appId === 'form-filler' || appId === 'tools-form-filler') {
    targetApp = 'form-filler'
    title = 'Interactive Form Filler'
  } else if (appId === 'transactiondesk' || appId === 'transaction-desk') {
    targetApp = 'transactiondesk'
    title = 'TransactionDesk'
  } else if (appId === 'academy') {
    targetApp = 'academy'
    title = 'CE Shop Academy'
  }

  // Generate the SSO redirect URL for the iframe src
  const iframeSrc = targetApp === 'form-filler'
    ? '/tools/form-filler?embed=true'
    : targetApp === 'transactiondesk'
    ? 'https://pr.transactiondesk.com/'
    : targetApp === 'academy'
    ? 'https://primeamerica.theceshop.com/real-estate/'
    : `/api/sso/redirect?app=${encodeURIComponent(targetApp)}`

  return (
    <Layout title={title}>
      <div className="relative w-full h-[calc(100vh-140px)] bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 shadow-inner">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-10">
            <Loader2 className="h-10 w-10 text-brand-navy animate-spin mb-4" />
            <p className="text-sm font-semibold text-gray-600">Connecting via Secure Single Sign-On...</p>
          </div>
        )}
        <iframe
          src={iframeSrc}
          className="w-full h-full border-0"
          onLoad={() => setLoading(false)}
          allow="geolocation; microphone; camera; midi; encrypted-media; clipboard-write;"
        />
      </div>
    </Layout>
  )
}
