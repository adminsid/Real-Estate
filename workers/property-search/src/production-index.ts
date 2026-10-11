import { handleProduction } from './production.mjs'
export default {
 async fetch(request: Request, env: ProductionEnv): Promise<Response> {
  return handleProduction(request, env)
 },
} satisfies ExportedHandler<ProductionEnv>
