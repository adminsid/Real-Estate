import type { Env } from '../index'
const err = (error: string, status = 400) =>
  Response.json({ success: false, error }, { status })
const ok = (data: unknown) => Response.json({ success: true, data })
export async function handleOperationsFiles(
  request: Request,
  env: Env,
  session: { tenantId: string },
) {
  const path = new URL(request.url).pathname
  const method = request.method
  const fileMatch = path.match(
    /^\/api\/operations\/projects\/([A-Za-z0-9_-]+)\/files(?:\/([A-Za-z0-9_.-]+))?$/,
  )
  if (fileMatch) {
    const project = await env.DB.prepare(
      'SELECT id FROM operations_projects WHERE id=? AND tenant_id=?',
    )
      .bind(fileMatch[1], session.tenantId)
      .first<{ id: string }>()
    if (!project) return err('Project not found', 404)
    const prefix = `operations/${session.tenantId}/${project.id}/`
    if (method === 'GET' && fileMatch[2]) {
      const object = await env.ASSETS_BUCKET.get(prefix + fileMatch[2])
      if (!object) return err('File not found', 404)
      const headers = new Headers({
        'Content-Type':
          object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      })
      return new Response(object.body, { headers })
    }
    if (method === 'POST' && !fileMatch[2]) {
      const mime = request.headers.get('Content-Type') || ''
      const kinds: Record<string, string> = {
        'image/jpeg': 'photo',
        'image/png': 'photo',
        'image/webp': 'photo',
        'application/pdf': 'document',
        'video/mp4': 'video',
      }
      if (!kinds[mime]) return err('Upload a JPEG, PNG, WebP, PDF, or MP4 file')
      const reader = request.body?.getReader()
      if (!reader) return err('Missing file')
      const chunks: Uint8Array[] = []
      let length = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > 20 * 1024 * 1024) {
          await reader.cancel()
          return err('Files must be 20 MB or smaller', 413)
        }
        chunks.push(value)
      }
      if (!length) return err('File is empty')
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      const id = crypto.randomUUID()
      await env.ASSETS_BUCKET.put(prefix + id, bytes, {
        httpMetadata: { contentType: mime },
      })
      return ok({
        asset: {
          id,
          name: (request.headers.get('X-File-Name') || 'Uploaded asset').slice(
            0,
            240,
          ),
          kind: kinds[mime],
          url: `/api/operations/projects/${project.id}/files/${id}`,
          hero: false,
        },
      })
    }
    return err('Method not allowed', 405)
  }

  return null
}
