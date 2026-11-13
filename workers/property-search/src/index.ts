import { syncLive } from './sync.mjs'
import { handleRequest } from './runtime.mjs'
import { publishJobs } from './job-store.mjs'
import { seedJobs,consumeMediaJobs } from './media-jobs.mjs'
import { geocodeIndependently } from './location-sync.mjs'
export { SourceGateway } from './source-gateway'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, {schedule:work=>ctx.waitUntil(work)})
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const result = await syncLive(env)
    console.log(JSON.stringify({ event: 'mls_grid_sync', ...result }))
    if(env.LIVE_SYNC_ENABLED==='true'){
      await seedJobs(env)
      await publishJobs(env)
      await geocodeIndependently(env)
    }
  },
  async queue(batch:MessageBatch<unknown>,env:Env):Promise<void>{
    await consumeMediaJobs(batch,env)
  },
} satisfies ExportedHandler<Env>
