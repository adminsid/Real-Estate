import sellerTemplate from './next-seller-template.json'

export interface NextOutcome {
  id: string; name: string; description: string; done: boolean; hidden: boolean
  gateway?: boolean; star?: boolean; assigneeId?: string; dueDate?: string
  notApplicable?: string
}
export interface NextMilestone { id: string; name: string; description: string; hidden: boolean; outcomes: NextOutcome[] }
export interface NextPhase { id: string; name: string; milestones: NextMilestone[] }
export interface NextDocument {
  name: string; description: string; templateVersion: string; phases: NextPhase[]
  contactIds: string[]; listingId: string; transactionId: string
  inventoryUrl: string; inventoryLabel: string
}
export interface NextMember { id: string; name: string; role: string }
export interface NextJourney {
  id: string; ownerId: string; revision: number; createdAt: string; updatedAt: string
  document: NextDocument; members: NextMember[]; canManage: boolean; canWrite: boolean
}
export interface NextSummary { id: string; name: string; done: number; total: number; updatedAt: string }
export interface NextAssignment { journeyId: string; journeyName: string; phaseId: string; milestoneId: string; outcome: NextOutcome; revision: number }
export interface NextComment { id: string; outcome_id: string; body: string; user_name: string; created_at: string }
export interface NextOffer { id: string; date: string; buyer: string; agent: string; price: string; terms: string; notes: string; status: string }
export interface NextShowing { id: string; time: string; type: string; agent: string; contact: string; feedback: string; followUp: string }
export const offerStatuses = ['Received', 'Presented to Seller', 'Countered', 'Accepted', 'Rejected', 'Withdrawn']
export const showingFollowUps = ['New', 'Contacted', 'Feedback left', 'Tour scheduled', 'No response', 'No interest']

export function newSellerJourney(name: string, seeded = true): NextDocument {
  return { name, description: 'Standard real-estate selling journey — Pre-Listing, Listing & Marketing, Contract, Closing.',
    templateVersion: 'seller-v1', phases: structuredClone(sellerTemplate).map(p => ({ ...p, milestones: seeded ? p.milestones : [] })),
    contactIds: [], listingId: '', transactionId: '', inventoryUrl: '/inventory', inventoryLabel: 'Inventory' }
}
export function nextProgress(phases: NextPhase[]) {
  const outcomes = phases.flatMap(p => p.milestones.flatMap(m => m.outcomes)).filter(o => !o.notApplicable)
  const done = outcomes.filter(o => o.done).length
  return { done, total: outcomes.length, percent: outcomes.length ? Math.round(done / outcomes.length * 100) : 0 }
}
export function nextGateway(phases: NextPhase[]) {
  return phases.flatMap(p => p.milestones.flatMap(m => m.outcomes)).some(o => o.gateway && !o.done)
}
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max
export const validNextId = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x)
export const validNextDate = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x
export function validInventoryUrl(value: unknown): value is string {
  if (!text(value, 2000)) return false
  if (/^\/(?!\/)[^\\\s]*$/.test(value)) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
export function validateNextDocument(value: unknown): asserts value is NextDocument {
  if (!object(value) || !text(value.name, 200) || !value.name.trim() || !text(value.description, 5000)
    || !text(value.templateVersion, 100) || !validInventoryUrl(value.inventoryUrl) || !text(value.inventoryLabel, 60)
    || !Array.isArray(value.contactIds) || value.contactIds.length > 30 || !value.contactIds.every(validNextId)
    || ![value.listingId, value.transactionId].every(x => x === '' || validNextId(x))
    || !Array.isArray(value.phases) || value.phases.length !== 4) throw new Error('Invalid journey details')
  const ids = new Set<string>(); let total = 0
  const unique = (x: unknown) => { if (!validNextId(x) || ids.has(x)) throw new Error('Journey items must have unique IDs'); ids.add(x) }
  for (const [i, p] of value.phases.entries()) {
    if (!object(p) || !text(p.name, 200) || !p.name.trim() || !Array.isArray(p.milestones) || p.milestones.length > 100) throw new Error('Invalid phase')
    unique(p.id)
    if (p.id !== ['prelisting','marketing','contract','closing'][i]) throw new Error('The four seller phases must be preserved')
    for (const m of p.milestones) {
      if (!object(m) || !text(m.name, 300) || !m.name.trim() || !text(m.description, 10000) || typeof m.hidden !== 'boolean'
        || !Array.isArray(m.outcomes) || m.outcomes.length > 200) throw new Error('Invalid milestone')
      unique(m.id)
      for (const o of m.outcomes) {
        if (!object(o) || !text(o.name, 500) || !o.name.trim() || !text(o.description, 10000) || typeof o.done !== 'boolean' || typeof o.hidden !== 'boolean'
          || (o.assigneeId !== undefined && o.assigneeId !== '' && !validNextId(o.assigneeId))
          || (o.dueDate !== undefined && o.dueDate !== '' && !validNextDate(o.dueDate))
          || (o.notApplicable !== undefined && !text(o.notApplicable, 500))
          || (o.gateway !== undefined && typeof o.gateway !== 'boolean') || (o.star !== undefined && typeof o.star !== 'boolean')
          || (o.gateway && o.notApplicable)) throw new Error('Invalid outcome')
        unique(o.id); total++
      }
    }
  }
  if (total > 2000 || JSON.stringify(value).length > 750000) throw new Error('Journey is too large')
}

// Accept both Next exports and the original prototype's localStorage export, as new copies.
export function importNextJourneys(value: unknown): { document: NextDocument; offers: NextOffer[]; showings: NextShowing[] }[] {
  if (!object(value)) throw new Error('Choose a Next JSON export')
  const items = Array.isArray(value.journeys) ? value.journeys : [value]
  if (!items.length || items.length > 20) throw new Error('Import between 1 and 20 journeys at a time')
  return items.map(item => {
    if (!object(item)) throw new Error('Invalid journey export')
    const raw = object(item.document) ? item.document : item
    if (!Array.isArray(raw.phases) || raw.phases.length !== 4) throw new Error('Expected all four seller phases')
    const doc = { ...newSellerJourney(String(raw.name || 'Imported journey')), ...raw,
      contactIds: [], listingId: '', transactionId: '',
      phases: raw.phases.map((p, i) => {
        if (!object(p) || !Array.isArray(p.milestones)) throw new Error('Invalid phase')
        return { ...p, id: ['prelisting','marketing','contract','closing'][i], milestones: p.milestones.map(m => {
          if (!object(m) || !Array.isArray(m.outcomes)) throw new Error('Invalid milestone')
          return { ...m, outcomes: m.outcomes.map(o => {
            if (!object(o)) throw new Error('Invalid outcome')
            return { ...o, assigneeId: '' }
          }) }
        }) }
      }) }
    validateNextDocument(doc)
    return { document: doc, offers: validateNextOffers(item.offers ?? []), showings: validateNextShowings(item.showings ?? []) }
  })
}
export function validateNextOffers(value: unknown): NextOffer[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('Invalid offers')
  const ids = new Set<string>()
  for (const o of value) {
    if (!object(o) || !validNextId(o.id) || ids.has(o.id) || !validNextDate(o.date) || !text(o.buyer,300)
      || !text(o.agent,500) || !text(o.price,50) || !Number.isFinite(Number(o.price.replace(/[$,\s]/g,'')))
      || Number(o.price.replace(/[$,\s]/g,'')) < 0 || !text(o.terms,10000) || !text(o.notes,10000)
      || !offerStatuses.includes(String(o.status))) throw new Error('Invalid offer')
    ids.add(o.id)
  }
  return value
}
export function validateNextShowings(value: unknown): NextShowing[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error('Invalid showings')
  const ids = new Set<string>()
  for (const s of value) {
    if (!object(s) || !validNextId(s.id) || ids.has(s.id) || !text(s.time,40) || !s.time || !Number.isFinite(Date.parse(s.time))
      || !text(s.type,100) || !text(s.agent,500) || !text(s.contact,500) || !text(s.feedback,10000)
      || !showingFollowUps.includes(String(s.followUp))) throw new Error('Invalid showing')
    ids.add(s.id)
  }
  return value
}
