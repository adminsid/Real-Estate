import { useEffect, useState } from 'react'

export type LinkedListingClose = { listingId: string; dealName: string; closeDate: string }
type ListingStatus = { id: string; name: string; status: string; updatedAt: string; closeDate?: string }

export function CloseLinkedListingPrompt({ listingId, dealName, closeDate, onClose }: LinkedListingClose & { onClose: () => void }) {
  const [listing, setListing] = useState<ListingStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reload, setReload] = useState(0)
  const endpoint = `/api/listings/${encodeURIComponent(listingId)}/status`
  useEffect(() => {
    const controller = new AbortController()
    setListing(null)
    setError('')
    void (async () => {
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Unable to load the linked listing.')
        if (!controller.signal.aborted) setListing(body)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load the linked listing.')
      }
    })()
    return () => controller.abort()
  }, [endpoint, reload])
  const alreadyClosed = listing?.status.toLowerCase() === 'closed'
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="close-listing-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
      <h2 id="close-listing-title" className="text-lg font-bold text-gray-900">{saved ? 'Listing updated' : 'Also close the linked listing?'}</h2>
      <p className="mt-2 text-sm text-gray-600">The deal “{dealName}” is closed. Its closing has already been saved.</p>
      {saved ? <p role="status" className="mt-4 text-sm text-emerald-700">The listing is now Closed with an actual close date of {closeDate}.</p> : <>
        {!listing && !error && <p className="mt-4 text-sm" role="status">Loading current listing…</p>}
        {listing && <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm">
          <p className="font-semibold">{listing.name}</p>
          <p className="mt-2">Current listing status: <strong>{listing.status}</strong></p>
          {alreadyClosed ? <p className="mt-2">This listing is already Closed{listing.closeDate ? ` (${listing.closeDate})` : ''}. No change is needed here.</p> : <p className="mt-2">Change to <strong>Closed</strong>, with actual close date <strong>{closeDate}</strong> (New York date).</p>}
        </div>}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error} The deal remains closed.</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button autoFocus type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">{saved || alreadyClosed ? 'Done' : 'Keep listing unchanged'}</button>
        {error && !saved ? <button type="button" disabled={busy} onClick={() => setReload(value => value + 1)} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Reload listing</button> : !saved && listing && !alreadyClosed && <button type="button" disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={async () => {
          setBusy(true)
          setError('')
          try {
            const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingStatus: 'Closed', closeDate, expectedUpdatedAt: listing.updatedAt, statusNote: `Confirmed after closing deal: ${dealName}` }) })
            const body = await response.json()
            if (!response.ok) throw new Error(body.error || 'Unable to update the listing.')
            setSaved(true)
          } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update the listing.') }
          finally { setBusy(false) }
        }}>{busy ? 'Saving…' : 'Confirm listing closure'}</button>}
      </div>
    </section>
  </div>
}
