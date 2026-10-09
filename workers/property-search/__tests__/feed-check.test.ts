import { describe, expect, it, vi } from 'vitest'
import { checkFeed, feedPage } from '../src/feed-check.mjs'
import { handleRequest } from '../src/runtime.mjs'

const secret = 'fictional-test-token'
const env = { MLS_GRID_ACCESS_TOKEN: secret, APP_ENV: 'staging', DATASET: 'synthetic', PUBLIC_ORIGIN: 'https://preview-search.primeamericany.com', FEED_OPERATOR_EMAIL: 'owner@example.invalid' }
const row = { OriginatingSystemName: 'onekey2', MlgCanView: true, MlgCanUse: ['IDX'] }
const request = (method = 'POST', origin: string | null = env.PUBLIC_ORIGIN) => new Request(env.PUBLIC_ORIGIN + '/ops/mls-grid', {method, headers: origin ? {Origin: origin} : {}})

describe('Production MLS GRID connection check', () => {
  it('sends one fixed OneKey request and never forwards returned rows or next links', async () => {
    const fetcher = vi.fn(async (_url: string, _options: RequestInit) => Response.json({value: [{...row, PrivateRemarks: 'do not disclose', Media: [{MediaURL: 'https://untrusted.example/private'}]}], '@odata.nextLink': 'https://untrusted.example/steal'}))
    const result = await checkFeed(env, fetcher)
    expect(result).toMatchObject({state: 'connected', sampleAllowsIdx: true, sampledRecords: 1, synchronizationEnabled: false, publication: 'synthetic'})
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, options] = fetcher.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://api.mlsgrid.com/v2/Property')
    expect(parsed.searchParams.get('$filter')).toBe("OriginatingSystemName eq 'onekey2' and MlgCanView eq true")
    expect(parsed.searchParams.get('$top')).toBe('1')
    expect(parsed.searchParams.has('$expand')).toBe(false)
    expect(options).toMatchObject({redirect: 'manual', cache: 'no-store', headers: {Authorization: 'Bearer ' + secret}})
    const output = JSON.stringify(result) + feedPage(env, result)
    for (const value of [secret, 'PrivateRemarks', 'do not disclose', 'MediaURL', 'untrusted.example', '@odata.nextLink']) expect(output).not.toContain(value)
  })
  it('distinguishes an empty feed and a VOW-only sample from verified IDX access', async () => {
    expect(await checkFeed(env, async () => Response.json({value: []}))).toMatchObject({state: 'connected_empty', sampledRecords: 0})
    expect(await checkFeed(env, async () => Response.json({value: [{...row, MlgCanUse: ['VOW']}]}))).toMatchObject({state: 'connected', sampleAllowsIdx: false})
  })
  it('rejects mismatched sources, permission fields, envelopes, excess records and oversized bodies', async () => {
    for (const body of [{value: [{...row, OriginatingSystemName: 'other'}]}, {value: [{...row, MlgCanView: false}]}, {value: [{...row, MlgCanUse: null}]}, {value: [row, row]}, {error: secret}]) {
      expect(await checkFeed(env, async () => Response.json(body))).toMatchObject({state: 'invalid_response'})
    }
    expect(await checkFeed(env, async () => new Response('x'.repeat(1024 * 1024 + 1)))).toMatchObject({state: 'invalid_response'})
  })
  it('redacts upstream errors and separates authentication, permission, quota and transport failures without retrying', async () => {
    for (const [status, state] of [[401, 'authentication_failed'], [403, 'access_denied'], [429, 'rate_limited'], [302, 'upstream_error'], [500, 'upstream_error']] as const) {
      const fetcher = vi.fn(async () => new Response(secret, {status, headers: {Location: 'https://untrusted.example'}}))
      const result = await checkFeed(env, fetcher)
      expect(result).toMatchObject({state, upstreamStatus: status})
      expect(JSON.stringify(result)).not.toContain(secret)
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
    expect(await checkFeed(env, async () => {throw Error(secret)})).toMatchObject({state: 'connection_failed'})
    const fetcher = vi.fn()
    expect(await checkFeed({...env, MLS_GRID_ACCESS_TOKEN: ''}, fetcher)).toMatchObject({state: 'not_configured'})
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('performs no feed or database work for unauthorized requests, GET/HEAD, rejected origins or methods', async () => {
    const authorize = vi.fn(async () => true), feedFetcher = vi.fn(async () => Response.json({value: [row]}))
    for (const method of ['GET', 'HEAD']) {
      const response = await handleRequest(request(method), env, {authorize, feedFetcher})
      expect(response.status).toBe(200)
      expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
      expect(response.headers.get('Cache-Control')).toBe('private, no-store')
      if (method === 'HEAD') expect(await response.text()).toBe('')
    }
    expect(authorize).toHaveBeenCalledWith(expect.any(Request), env, undefined, expect.any(Number), env.FEED_OPERATOR_EMAIL)
    for (const origin of [null, 'https://another.example']) expect((await handleRequest(request('POST', origin), env, {authorize, feedFetcher})).status).toBe(403)
    expect((await handleRequest(request('DELETE'), env, {authorize, feedFetcher})).status).toBe(405)
    expect((await handleRequest(request(), env, {authorize: async () => false, feedFetcher})).status).toBe(403)
    expect((await handleRequest(request(), {...env, FEED_OPERATOR_EMAIL: ''}, {authorize, feedFetcher})).status).toBe(403)
    expect(feedFetcher).not.toHaveBeenCalled()
    const result = await handleRequest(request(), env, {authorize, feedFetcher})
    expect(result.status).toBe(200)
    expect(await result.text()).toContain('Production access verified')
    expect(feedFetcher).toHaveBeenCalledTimes(1)
  })
})
