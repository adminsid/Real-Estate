import { describe, expect, it } from 'vitest'
import {
  buildProcedure,
  normalizeProjectStage,
  PROJECT_STAGES,
  parseAssetTags,
  newTask,
  projectCompletion,
  safeAssetUrl,
  shiftDate,
  buildMlsChecklist,
  emptyWorkflow,
  mlsPhotoDeadline,
} from '@/domain/operations'
import { getCalendarDaysForMonth, toDateKey } from '../operations-calendar'

describe('Operations procedures', () => {
  it('keeps MLS entry ahead of the marketing launch and adds all five requirements', () => {
    const tasks = buildProcedure(
      'Marketing Plan',
      '2026-10-09',
      'Maria',
      [],
      '2026-10-16',
    )
    expect(tasks.filter((t) => t.presetKey.startsWith('mls:'))).toHaveLength(5)
    expect(tasks.find((t) => t.presetKey === 'mls:v1:entry')?.dueDate).toBe(
      '2026-10-10',
    )
    expect(
      tasks.find((t) => t.title === 'Prepare MLS and marketing site drafts')
        ?.dueDate,
    ).toBe('2026-10-09')
    const existing = buildMlsChecklist('2026-10-09', 'Maria')
    existing[0].description = 'Broker-reviewed instructions'
    expect(buildMlsChecklist('2026-10-09', 'Maria', existing)).toHaveLength(0)
    expect(existing[0].description).toBe('Broker-reviewed instructions')
  })
  it('anchors MLS deadlines to the Listing Date and the exact entry timestamp across DST', () => {
    const workflow = {
      ...emptyWorkflow(),
      mlsListingDate: '2026-10-06',
      mlsEnteredAt: '2026-11-01T05:30:00Z',
      clearCooperationDueDate: '2026-10-13',
    }
    const tasks = buildMlsChecklist('2026-10-05', 'Maria', [], workflow)
    expect(tasks.find((t) => t.presetKey === 'mls:v1:entry')?.dueDate).toBe(
      '2026-10-07',
    )
    expect(
      tasks.find((t) => t.presetKey === 'mls:v1:cooperation')?.dueDate,
    ).toBe('2026-10-13')
    expect(mlsPhotoDeadline(workflow.mlsEnteredAt)).toBe(
      '2026-11-02T05:30:00.000Z',
    )
    expect(mlsPhotoDeadline('')).toBe('')
  })
  it('anchors creation to signing and 21 publications to launch', () => {
    const tasks = buildProcedure(
      'Marketing Plan',
      '2026-10-05',
      'Maria',
      [],
      '2026-10-12',
    )
    const content = tasks.filter((t) => t.presetKey.startsWith('content:'))
    expect(content).toHaveLength(21)
    expect(content[0]).toMatchObject({
      dueDate: '2026-10-11',
      publishDate: '2026-10-12',
      requiresApproval: true,
    })
    expect(content[20].publishDate).toBe('2026-11-01')
    expect(
      buildProcedure(
        'Marketing Plan',
        '2026-10-05',
        'Maria',
        tasks,
        '2026-10-12',
      ),
    ).toHaveLength(0)
  })
  it('uses closing offsets rather than signing for closing preparation', () => {
    const tasks = buildProcedure('Closing', '2026-11-20', 'TC')
    expect(tasks[0].dueDate).toBe('2026-11-13')
    expect(tasks[tasks.length - 1].dueDate).toBe('2026-11-21')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('counts completed work without credit for advancing phases', () => {
    const task = newTask('Photo review')
    expect(projectCompletion({ tasks: [task] })).toBe(0)
    expect(projectCompletion({ tasks: [{ ...task, status: 'done' }] })).toBe(
      100,
    )
  })
  it('rejects unsafe asset and credential-bearing links', () => {
    expect(safeAssetUrl('javascript:alert(1)')).toBe(false)
    expect(safeAssetUrl('https://user:pass@example.com/photo')).toBe(false)
    expect(safeAssetUrl('https://example.com/photo')).toBe(true)
  })
  it('builds Monday-first dates using local calendar days', () => {
    const days = getCalendarDaysForMonth(new Date(2026, 9, 1), [])
    expect(days[0].date.getDay()).toBe(1)
    expect(toDateKey(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
  })
})

describe('Project phase compatibility', () => {
  it('uses the six engagement phases and keeps old closing preparation under contract', () => {
    expect(PROJECT_STAGES).toEqual([
      'Pre-Listing Due Diligence',
      'Listing Agreement Signed',
      'Marketing',
      'Under Contract',
      'Closed',
      'Completed',
    ])
    expect(normalizeProjectStage('Marketing Plan')).toBe('Marketing')
    expect(normalizeProjectStage('Launch')).toBe('Marketing')
    expect(normalizeProjectStage('Closing')).toBe('Under Contract')
  })
  it('reuses legacy preset keys without duplicating customized work', () => {
    const existing = buildProcedure('Marketing Plan', '2026-10-08', 'Gobinda')
    existing[0].description = 'Confirmed with the sales team'
    expect(
      buildProcedure('Marketing', '2026-10-08', 'Gobinda', existing),
    ).toEqual([])
    expect(existing[0].description).toBe('Confirmed with the sales team')
    const closing = buildProcedure('Closed', '2026-11-20', 'Gobinda')
    expect(closing[0].phase).toBe('Under Contract')
    expect(closing[closing.length - 1].phase).toBe('Closed')
  })
  it('normalizes and deduplicates asset tags', () => {
    expect(parseAssetTags(' MLS, signed agreement, mls, , Photos ')).toEqual([
      'mls',
      'signed agreement',
      'photos',
    ])
  })
})
