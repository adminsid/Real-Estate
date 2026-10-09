export type ProjectCalendarInput = {
  id: string
  name: string
  currentStage?: string
  dueDate?: string | null
  tasks?: Array<{
    id: string
    title: string
    dueDate?: string | null
    publishDate?: string
    status?: string
  }>
}
export type OperationCalendarEvent = {
  id: string
  title: string
  date: string
  kind: 'project' | 'task' | 'publication'
  projectId: string
  taskId?: string
  stage?: string
  done?: boolean
}
export function toDateKey(date: Date) {
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function validDate(value: string) {
  return !Number.isNaN(new Date(value).getTime()) ? value.slice(0, 10) : ''
}
export function buildOperationsCalendarEvents(
  projects: ProjectCalendarInput[],
): OperationCalendarEvent[] {
  const events: OperationCalendarEvent[] = []
  for (const project of projects) {
    const base = { projectId: project.id, stage: project.currentStage }
    if (project.dueDate && validDate(project.dueDate))
      events.push({
        ...base,
        id: `${project.id}-project`,
        title: project.name,
        date: validDate(project.dueDate),
        kind: 'project',
      })
    for (const task of project.tasks || []) {
      if (task.dueDate && validDate(task.dueDate))
        events.push({
          ...base,
          taskId: task.id,
          id: `${project.id}-${task.id}`,
          title: task.title,
          date: validDate(task.dueDate),
          kind: 'task',
          done: task.status === 'done',
        })
      if (task.publishDate && validDate(task.publishDate))
        events.push({
          ...base,
          taskId: task.id,
          id: `${project.id}-${task.id}-publish`,
          title: `Post · ${task.title}`,
          date: validDate(task.publishDate),
          kind: 'publication',
        })
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date))
}
export function getCalendarDaysForMonth(
  month: Date,
  events: OperationCalendarEvent[],
) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      inMonth: date.getMonth() === month.getMonth(),
      events: events.filter((e) => e.date === toDateKey(date)),
    }
  })
}
