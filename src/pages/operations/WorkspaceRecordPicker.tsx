import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { operationsRequest } from './operations-api'

type RecordOption = { id: string; label: string; detail: string }
type RecordKind = 'contact' | 'listing' | 'deal'
const labels = { contact: 'CRM contact', listing: 'Listing', deal: 'Deal' }
const routes = {
  contact: '/marketing/crm',
  listing: '/inventory/listings',
  deal: '/transactions',
}
export function WorkspaceRecordPicker({
  kind,
  value,
  onChange,
  address,
  clientName,
  onBusy,
}: {
  kind: RecordKind
  value: string
  onChange: (id: string) => void
  address: string
  clientName: string
  onBusy: (busy: boolean) => void
}) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<RecordOption[]>([])
  const [selected, setSelected] = useState<RecordOption | null>(null),
    [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('')
  const [name, setName] = useState(kind === 'contact' ? clientName : address)
  const [lastName, setLastName] = useState(''),
    [email, setEmail] = useState(''),
    [propertyType, setPropertyType] = useState('Residential')
  const [city, setCity] = useState('New York'),
    [zip, setZip] = useState(''),
    [dealType, setDealType] = useState('sale')
  useEffect(() => {
    const controller = new AbortController()
    if (!value) {
      setSelected(null)
      return
    }
    void operationsRequest<{ records: RecordOption[] }>(
      `/records?type=${kind}&id=${encodeURIComponent(value)}`,
      { signal: controller.signal },
    )
      .then((data) => setSelected(data.records[0] || null))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [kind, value])
  useEffect(() => {
    const controller = new AbortController()
    setResults([])
    if (query.trim().length < 2) {
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      void operationsRequest<{ records: RecordOption[] }>(
        `/records?type=${kind}&q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      )
        .then((data) => {
          setResults(data.records)
          setError('')
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [kind, query])
  async function create() {
    if (
      !name.trim() ||
      (kind === 'contact' && !lastName.trim()) ||
      (kind === 'listing' && (!city.trim() || !zip.trim()))
    ) {
      setError('Complete the required fields before creating the record.')
      return
    }
    if (
      kind === 'contact' &&
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError('Enter a valid email address.')
      return
    }
    setSaving(true)
    onBusy(true)
    setError('')
    try {
      const payload =
        kind === 'contact'
          ? {
              firstName: name.trim(),
              lastName: lastName.trim(),
              email: email.trim() || undefined,
              type: 'seller',
              lifecycleStage: 'active_client',
              address,
            }
          : kind === 'deal'
            ? { name: name.trim(), type: dealType, parties: [] }
            : {
                name: name.trim(),
                propertyType,
                data: {
                  propertyType,
                  streetAddress: name.trim(),
                  city: city.trim(),
                  stateOrProvince: 'NY',
                  postalCode: zip.trim(),
                },
              }
      const response = await fetch(
        kind === 'contact'
          ? '/api/contacts'
          : kind === 'listing'
            ? '/api/listings'
            : '/api/transactions',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const json = await response.json()
      if (!response.ok || json.success === false)
        throw new Error(json.error || 'Unable to create the record')
      const id = json.data?.contact?.id || json.data?.id || json.id
      if (!id)
        throw new Error(
          'The record may have been created. Search for it before retrying.',
        )
      const record = {
        id,
        label:
          kind === 'contact'
            ? `${name.trim()} ${lastName.trim()}`
            : name.trim(),
        detail: '',
      }
      setSelected(record)
      onChange(id)
      setCreating(false)
      setQuery('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
      onBusy(false)
    }
  }
  return (
    <section
      className="ops-record-picker"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement)
          e.preventDefault()
      }}
    >
      <h3>{labels[kind]}</h3>
      {value && (
        <div className="ops-record-selected">
          <Link to={`${routes[kind]}/${encodeURIComponent(value)}`}>
            {selected?.label || `Open linked ${labels[kind].toLowerCase()}`}
          </Link>
          <button
            type="button"
            aria-label={`Unlink ${labels[kind]}`}
            onClick={() => {
              onChange('')
              setSelected(null)
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <label>
        <span>
          <Search size={14} /> Search by{' '}
          {kind === 'contact' ? 'name, email or phone' : 'name or address'}
        </span>
        <input
          value={query}
          maxLength={120}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            kind === 'contact'
              ? clientName || 'Client name'
              : address || 'Property address'
          }
        />
      </label>
      <div className="ops-record-results" aria-live="polite">
        {loading ? (
          <p>Searching…</p>
        ) : (
          results.map((record) => (
            <button
              type="button"
              key={record.id}
              onClick={() => {
                setSelected(record)
                onChange(record.id)
                setQuery('')
                setCreating(false)
              }}
            >
              <strong>{record.label}</strong>
              <small>{record.detail}</small>
            </button>
          ))
        )}
        {!loading && query.trim().length >= 2 && !results.length && !error && (
          <p>No matching records.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setCreating(!creating)
          setError('')
        }}
      >
        <Plus size={14} /> Create {labels[kind].toLowerCase()}
      </button>
      {creating && (
        <div className="ops-record-create">
          <label>
            {kind === 'contact'
              ? 'First name'
              : kind === 'listing'
                ? 'Street address / unit'
                : 'Deal name / address'}
            <input
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {kind === 'contact' && (
            <>
              <label>
                Last name
                <input
                  value={lastName}
                  maxLength={120}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
              <label>
                Email (optional)
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </>
          )}
          {kind === 'listing' && (
            <>
              <label>
                Property type
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                >
                  {[
                    'Residential',
                    'Residential Income',
                    'Rental',
                    'Commercial Sale',
                    'Commercial Lease',
                    'Land',
                    'Business Opportunity',
                  ].map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <div className="ops-form-grid">
                <label>
                  City
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </label>
                <label>
                  ZIP
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    maxLength={10}
                  />
                </label>
              </div>
            </>
          )}
          {kind === 'deal' && (
            <label>
              Deal type
              <select
                value={dealType}
                onChange={(e) => setDealType(e.target.value)}
              >
                <option value="sale">Sale</option>
                <option value="lease">Lease</option>
              </select>
            </label>
          )}
          <button type="button" disabled={saving} onClick={() => void create()}>
            {saving ? 'Creating…' : 'Create & select'}
          </button>
          <small>
            Creates a workspace record now. Save project settings to keep its
            connection.
          </small>
        </div>
      )}
      {error && (
        <p className="ops-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
