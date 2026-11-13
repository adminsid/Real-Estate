import { handleProduction } from './production.mjs'
export default {
 async fetch(request: Request, env: ProductionEnv,ctx:ExecutionContext): Promise<Response> {
  return handleProduction(request, env,{schedule:work=>ctx.waitUntil(work)})
 },
} satisfies ExportedHandler<ProductionEnv>
