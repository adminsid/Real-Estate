import { describe, expect, it } from 'vitest'
import { buildOperationsCalendarEvents } from '../operations-calendar'

describe('operations calendar event builder', () => {
  it('creates calendar events from project due dates and task due dates', () => {
    const events = buildOperationsCalendarEvents([
      {
        id: 'proj-1',
        name: 'Northside Condo Launch',
        currentStage: 'Marketing',
        dueDate: '2026-10-12T00:00:00.000Z',
        tasks: [
          {
            id: 'task-1',
            title: 'MLS listing draft review',
            dueDate: '2026-10-15T00:00:00.000Z',
          },
        ],
      },
    ])

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      title: 'Northside Condo Launch',
      date: '2026-10-12',
    })
    expect(events[1]).toMatchObject({
      title: 'MLS listing draft review',
      date: '2026-10-15',
    })
  })
})

it('skips invalid dates rather than crashing the entire calendar', () => {
  expect(
    buildOperationsCalendarEvents([
      {
        id: 'p',
        name: 'Project',
        dueDate: 'invalid',
        tasks: [{ id: 't', title: 'Task', dueDate: '2026-10-12' }],
      },
    ]),
  ).toHaveLength(1)
})
