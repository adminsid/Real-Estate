import { useEffect } from 'react'

interface ExternalAppBridgeModalProps {
  appName?: string
  externalUrl: string
  description?: string
  onClose: () => void
}

export function ExternalAppBridgeModal({ externalUrl, onClose }: ExternalAppBridgeModalProps) {
  useEffect(() => {
    if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer')
    }
    onClose()
  }, [externalUrl, onClose])

  return null
}
