import { syncLive } from './sync.mjs'
import { handleRequest } from './runtime.mjs'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const result = await syncLive(env)
    console.log(JSON.stringify({ event: 'mls_grid_sync', ...result }))
  },
} satisfies ExportedHandler<Env>
