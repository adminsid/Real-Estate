export const PROJECT_STAGES = [
  'Pre-Listing Due Diligence',
  'Listing Agreement Signed',
  'Marketing',
  'Under Contract',
  'Closed',
  'Completed',
] as const
export type ProjectStage = (typeof PROJECT_STAGES)[number]
type LegacyProjectStage = 'Marketing Plan' | 'Launch' | 'Closing'
export function normalizeProjectStage(stage: string): ProjectStage {
  if (stage === 'Marketing Plan' || stage === 'Launch') return 'Marketing'
  if (stage === 'Closing') return 'Under Contract'
  return PROJECT_STAGES.includes(stage as ProjectStage)
    ? (stage as ProjectStage)
    : 'Listing Agreement Signed'
}
export function parseAssetTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}
export type ProjectStatus = 'Active' | 'Paused' | 'Delayed' | 'Complete'
export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'in_review',
  'changes_required',
  'approved',
  'done',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  changes_required: 'Changes requested',
  approved: 'Approved',
  done: 'Done',
}
export interface ProjectTask {
  id: string
  title: string
  owner: string
  dueDate: string
  status: TaskStatus
  phase: ProjectStage
  description: string
  ownerId: string
  approverId: string
  requiresApproval: boolean
  approvedBy: string
  approvedAt: string
  blockedBy: string
  assetIds: string[]
  presetKey: string
  platform: string
  publishDate: string
  publicationStatus: 'planned' | 'scheduled' | 'published'
  schedulerUrl: string
  caption: string
}
export interface ProjectAsset {
  id: string
  name: string
  kind: 'photo' | 'flyer' | 'video' | 'document' | 'link'
  tags?: string[]
  url: string
  hero: boolean
}
export interface ProjectComment {
  id: string
  author: string
  authorId?: string
  message: string
  createdAt: string
  taskId?: string
}
export interface ProjectWorkflow {
  collaboratorIds?: string[]
  launchDate: string
  contractDate: string
  closingDate: string
  agreementReference: string
  result: '' | 'sold' | 'leased' | 'withdrawn' | 'expired' | 'cancelled'
  templateVersion: number
  mlsListingDate?: string
  mlsEnteredAt?: string
  clearCooperationDueDate?: string
  originalListingDate?: string
}
export interface ProjectRecord {
  id: string
  version: number
  name: string
  clientName: string
  propertyAddress: string
  dealId: string
  listingId: string
  crmContactId: string
  signedDate: string
  currentStage: ProjectStage
  status: ProjectStatus
  dueDate: string
  completion: number
  owner: string
  tasks: ProjectTask[]
  assets: ProjectAsset[]
  comments: ProjectComment[]
  workflow: ProjectWorkflow
}
export interface OperationsMember {
  avatarUrl?: string | null
  id: string
  name: string
  role: string
}
export const emptyWorkflow = (): ProjectWorkflow => ({
  launchDate: '',
  contractDate: '',
  closingDate: '',
  agreementReference: '',
  result: '',
  templateVersion: 1,
  mlsListingDate: '',
  mlsEnteredAt: '',
  clearCooperationDueDate: '',
  originalListingDate: '',
})
export function newTask(
  title = '',
  phase: ProjectStage = 'Marketing',
): ProjectTask {
  return {
    id: crypto.randomUUID(),
    title,
    phase,
    owner: '',
    ownerId: '',
    approverId: '',
    dueDate: '',
    status: 'todo',
    description: '',
    requiresApproval: false,
    approvedBy: '',
    approvedAt: '',
    blockedBy: '',
    assetIds: [],
    presetKey: '',
    platform: '',
    publishDate: '',
    publicationStatus: 'planned',
    schedulerUrl: '',
    caption: '',
  }
}
export function dateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
}
export function shiftDate(value: string, days: number) {
  const date = new Date(`${dateOnly(value)}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function projectCompletion(project: Pick<ProjectRecord, 'tasks'>) {
  return project.tasks.length
    ? Math.round(
        (project.tasks.filter((t) => t.status === 'done').length /
          project.tasks.length) *
          100,
      )
    : 0
}
export function isOverdue(task: ProjectTask, today: string) {
  return (
    task.status !== 'done' && !!task.dueDate && dateOnly(task.dueDate) < today
  )
}
export function taskBlocker(task: ProjectTask, tasks: ProjectTask[]) {
  const predecessor = tasks.find((t) => t.id === task.blockedBy)
  return predecessor && predecessor.status !== 'done' ? predecessor.title : ''
}
export function safeAssetUrl(value: string) {
  if (
    /^\/api\/operations\/projects\/[A-Za-z0-9_-]+\/files\/[A-Za-z0-9_.-]+$/.test(
      value,
    )
  )
    return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}
export const MLS_REQUIREMENTS = [
  {
    id: 'entry',
    title: 'Enter exclusive listing — Rule 302',
    description:
      'Enter the exclusive listing before midnight on the calendar day after its Listing Date. Use any later entry date explicitly stated in the signed agreement. The marketing launch date does not postpone this requirement.',
    source:
      'https://support.onekeymls.com/hc/en-us/articles/37010139901204-Rules-and-Procedures-Violation-Overview',
  },
  {
    id: 'cooperation',
    title: 'Confirm Clear Cooperation',
    description:
      'Public marketing triggers MLS submission within one business day. This includes public websites, social posts, signs and flyers. Record the deadline when marketing first starts; confirm weekends, holidays and any applicable listing exemption with the broker.',
    source:
      'https://support.onekeymls.com/hc/en-us/articles/35177831768596-2-27-25-From-the-Desk-of-the-CEO-Ensuring-Fair-Housing-and-Equitable-Access-with-Compliance-to-Clear-Cooperation',
  },
  {
    id: 'photo',
    title: 'Upload front exterior photo',
    description:
      'Attach at least one front exterior photograph to the MLS listing within 24 hours of entry. For a documented seller instruction against photos, submit that instruction within the same window. Businesses for sale or rent are excepted by the photo rule.',
    source:
      'https://support.onekeymls.com/hc/en-us/articles/43263101370388-Photograph-Required-for-All-Listings',
  },
  {
    id: 'data',
    title: 'Verify listing data before submission',
    description:
      'Check the address, tax ID, property facts and required fields against official records before MLS submission. Correct discrepancies and attach the supporting research.',
    source:
      'https://support.onekeymls.com/hc/en-us/articles/43272204762388-Substantially-Complete-and-Accurate-Information',
  },
  {
    id: 'original-date',
    title: 'Verify original listing date — Rule 310.5',
    description:
      'A re-list by the same broker, in the same property class, before the original or extended expiration keeps its original Listing Date. A withdrawn or cancelled property off market for at least 60 days may have a newly signed agreement and date. Record the retained date and evidence before submission.',
    source:
      'https://support.onekeymls.com/hc/en-us/articles/43263287640596-Original-Listing-Date-Retained',
  },
] as const
export function mlsPhotoDeadline(enteredAt: string) {
  const timestamp = Date.parse(enteredAt)
  return Number.isFinite(timestamp)
    ? new Date(timestamp + 24 * 60 * 60 * 1000).toISOString()
    : ''
}
export function mlsTaskDueDate(
  id: string,
  signedDate: string,
  workflow: ProjectWorkflow,
) {
  const listingDate = workflow.mlsListingDate || signedDate
  if (id === 'entry') return shiftDate(listingDate, 1)
  if (id === 'cooperation') return workflow.clearCooperationDueDate || ''
  if (id === 'photo') {
    const deadline = mlsPhotoDeadline(workflow.mlsEnteredAt || '')
    return deadline
      ? new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(deadline))
      : ''
  }
  return dateOnly(listingDate)
}
export function buildMlsChecklist(
  signedDate: string,
  owner: string,
  existing: ProjectTask[] = [],
  workflow = emptyWorkflow(),
) {
  return MLS_REQUIREMENTS.filter(
    (rule) => !existing.some((task) => task.presetKey === `mls:v1:${rule.id}`),
  ).map((rule) => ({
    ...newTask(rule.title, 'Listing Agreement Signed'),
    owner,
    presetKey: `mls:v1:${rule.id}`,
    dueDate: mlsTaskDueDate(rule.id, signedDate, workflow),
    description: `${rule.description}\n\nOneKey rule: ${rule.source}`,
    requiresApproval: ['data', 'original-date'].includes(rule.id),
  }))
}
const procedures: Record<string, Array<[string, number, string, boolean?]>> = {
  'Marketing Plan': [
    [
      'Confirm signed agreement and kickoff',
      0,
      'Confirm the executed agreement, client preferences, project lead, and target launch date.',
    ],
    [
      'Research and verify property facts',
      1,
      'Verify unit, amenities, dimensions, pricing, disclosures, and source evidence.',
    ],
    [
      'Collect source photos and book photography',
      1,
      'Upload source media to the listing vault; confirm photography and access.',
    ],
    [
      'Select and organize photographs',
      2,
      'Select hero and supporting images, label rooms, and agree on the sequence.',
    ],
    [
      'Edit and approve the photo set',
      3,
      'Review corrected images and platform formats; attach the final media links.',
      true,
    ],
    [
      'Write and approve the listing description',
      3,
      'Write verified copy and obtain broker review before publication.',
      true,
    ],
    [
      'Complete Inventory listing record',
      0,
      'Open the linked listing and complete required facts and supporting documents.',
    ],
    [
      'Prepare MLS and marketing site drafts',
      0,
      'Prepare the MLS draft immediately for the Rule 302 entry deadline. Prepare other marketing sites alongside the launch kit; verify consistency with the canonical listing.',
      true,
    ],
    [
      'Prepare flyer and social templates',
      5,
      'Create print and social formats in Brand Hub and attach final assets.',
      true,
    ],
    [
      'Prepare property video',
      5,
      'Create, caption, and review the property video and vertical cut.',
      true,
    ],
    [
      'Review the 21-day marketing plan',
      6,
      'Check content variety, platform assignments, assets, captions, and publication dates.',
      true,
    ],
    [
      'Approve the launch kit',
      7,
      'Confirm photos, copy, listing drafts, flyer, video, and planned content are ready.',
      true,
    ],
  ],
  'Under Contract': [
    [
      'Confirm executed contract and key dates',
      0,
      'Record verified contract evidence and deadlines in the linked Deal.',
    ],
    [
      'Coordinate deposit and attorney handoff',
      1,
      'Confirm responsible parties and evidence in the transaction file.',
    ],
    [
      'Track inspections and financing',
      3,
      'Use actual transaction deadlines; adjust this suggested target to the contract.',
    ],
    [
      'Prepare condo or co-op board package',
      7,
      'Confirm building requirements, responsible parties, and submission readiness.',
      true,
    ],
    [
      'Review outstanding conditions',
      14,
      'Confirm conditions with the transaction coordinator and attorney.',
      true,
    ],
  ],
  Closing: [
    [
      'Confirm closing readiness',
      -7,
      'Verify closing date and remaining conditions with the transaction team.',
      true,
    ],
    [
      'Prepare closing documents and statement',
      -5,
      'Collect final documents and review the settlement information.',
      true,
    ],
    [
      'Coordinate final walkthrough',
      -1,
      'Confirm time, access, participants, and unresolved issues.',
    ],
    [
      'Confirm closing and archive the file',
      0,
      'Record verified closing evidence in the Deal; archive approved documents.',
    ],
    [
      'Send client follow-up',
      1,
      'Send a personal follow-up using permitted communication channels.',
    ],
  ],
}
export const CONTENT_TOPICS = [
  'Listing announcement',
  'Property photo tour',
  'Condo feature spotlight',
  'Neighborhood introduction',
  'Video walkthrough',
  'Open house invitation',
  'Week one recap',
  'Floor plan spotlight',
  'Kitchen and living spaces',
  'Building amenities',
  'Neighborhood lifestyle',
  'Frequently asked questions',
  'Property video highlight',
  'Week two recap',
  'Favorite property details',
  'Local destinations',
  'Photo carousel',
  'Viewing invitation',
  'Property story',
  'Weekend reminder',
  'Week three recap',
]
export function buildProcedure(
  phase: ProjectStage | LegacyProjectStage,
  anchor: string,
  owner: string,
  existing: ProjectTask[] = [],
  launchDate = '',
  workflow = emptyWorkflow(),
) {
  const procedureKey =
    phase === 'Marketing'
      ? 'Marketing Plan'
      : phase === 'Closed'
        ? 'Closing'
        : phase
  const generated = (procedures[procedureKey] || []).map(
    ([title, offset, description, review], index) => ({
      ...newTask(
        title,
        procedureKey === 'Closing' && offset < 0
          ? 'Under Contract'
          : procedureKey === 'Closing'
            ? 'Closed'
            : normalizeProjectStage(phase),
      ),
      dueDate: shiftDate(anchor, offset),
      owner,
      description,
      requiresApproval: !!review,
      presetKey: `${procedureKey}:v1:${index}`,
    }),
  )
  if (procedureKey === 'Marketing Plan') {
    generated.push(...buildMlsChecklist(anchor, owner, existing, workflow))
    CONTENT_TOPICS.forEach((topic, index) =>
      generated.push({
        ...newTask(topic, 'Marketing'),
        owner,
        dueDate: shiftDate(anchor, 6),
        publishDate: launchDate ? shiftDate(launchDate, index) : '',
        description:
          'Choose a platform, create or attach the asset, write the caption, and request review. After approval, schedule it in your social platform and save the scheduling link.',
        requiresApproval: true,
        presetKey: `content:v1:${index}`,
      }),
    )
  }
  return generated.filter(
    (task) => !existing.some((t) => t.presetKey === task.presetKey),
  )
}
