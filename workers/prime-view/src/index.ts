// Prime View Worker — Minimal Entry Point
// Currently serves only the health check.
// Expectations, capabilities, guidance, and progress routes removed until
// they are rebuilt on top of real workspace data.

import type { D1Database, KVNamespace, ExecutionContext, Fetcher } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  PRIME_VIEW_KV: KVNamespace;
  CRM: Fetcher;
  TRANSACTIONS: Fetcher;
  INTERNAL_API_SECRET: string;
  APP_ENV: string;
  WORKSPACE_NAME: string;
}

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (path === '/api/prime-view/public/health' || path === '/api/prime-view/health') {
      return json({ success: true, data: { status: 'ok', service: 'prime-view', env: env.APP_ENV, ts: Date.now() } });
    }

    return json({ success: false, error: 'Not found' }, 404);
  },
};
