import type {
  ProjectRecord,
  ProjectTask,
  ProjectAsset,
  OperationsMember,
} from '@/domain/operations'
import {
  emptyWorkflow,
  newTask,
  normalizeProjectStage,
} from '@/domain/operations'
export async function operationsRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/operations${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.success)
    throw new Error(json?.error || `Request failed (${response.status})`)
  return (json.data || json) as T
}
export function normalizeProject(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    currentStage: normalizeProjectStage(project.currentStage),
    workflow: { ...emptyWorkflow(), ...project.workflow },
    assets: (project.assets || []).map((asset) => ({
      ...asset,
      tags: asset.tags || [],
    })),
    comments: project.comments || [],
    tasks: (project.tasks || []).map((task) => ({
      ...newTask(),
      ...task,
      phase: normalizeProjectStage(task.phase),
    })),
  }
}
export async function loadProjects() {
  const projects: ProjectRecord[] = []
  for (let page = 0; ; page++) {
    const result = await operationsRequest<{
      projects: ProjectRecord[]
      hasMore: boolean
    }>(`/projects?page=${page}`)
    projects.push(...result.projects.map(normalizeProject))
    if (!result.hasMore) return projects
  }
}
export async function loadProject(id: string) {
  const result = await operationsRequest<{ project: ProjectRecord }>(
    `/projects/${encodeURIComponent(id)}`,
  )
  return normalizeProject(result.project)
}
export async function saveProject(project: ProjectRecord) {
  const result = await operationsRequest<{ project: ProjectRecord }>(
    `/projects/${encodeURIComponent(project.id)}`,
    { method: 'PUT', body: JSON.stringify(project) },
  )
  return normalizeProject(result.project)
}
export async function deleteProject(
  project: ProjectRecord,
  confirmation: string,
) {
  return operationsRequest(`/projects/${encodeURIComponent(project.id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmation, version: project.version }),
  })
}
export const loadMembers = () =>
  operationsRequest<OperationsMember[]>('/members')
export async function uploadAsset(projectId: string, file: File) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      'Files must be 20 MB or smaller. Link larger videos from the listing vault.',
    )
  const result = await operationsRequest<{ asset: ProjectAsset }>(
    `/projects/${projectId}/files`,
    {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-File-Name': file.name.replace(/[^\x20-\x7E]/g, '_'),
      },
      body: file,
    },
  )
  return result.asset
}
export function downloadContentPlan(project: ProjectRecord) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const rows = [
    [
      'Title',
      'Platform',
      'Creation deadline',
      'Publication date',
      'Caption',
      'Review state',
      'Publication state',
      'Asset links',
      'Scheduling link',
    ],
    ...project.tasks
      .filter((t) => t.presetKey.startsWith('content:') || t.platform)
      .map((t: ProjectTask) => [
        t.title,
        t.platform,
        t.dueDate,
        t.publishDate,
        t.caption,
        t.status,
        t.publicationStatus,
        project.assets
          .filter((a) => t.assetIds.includes(a.id))
          .map((a) => a.url)
          .join(' '),
        t.schedulerUrl,
      ]),
  ]
  const url = URL.createObjectURL(
    new Blob(
      [
        '\uFEFF' +
          rows
            .map((row) =>
              row
                .map((v) => escape(/^[=+\-@]/.test(v) ? `'${v}` : v))
                .join(','),
            )
            .join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8' },
    ),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${project.id}-content-plan.csv`
  link.click()
  URL.revokeObjectURL(url)
}
