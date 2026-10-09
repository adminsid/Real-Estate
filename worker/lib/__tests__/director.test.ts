/**
 * director.test.ts
 * Unit tests for worker/lib/director.ts — DIRECTOR.EXE Marketing OS
 *
 * Uses a mocked D1Database and mocked Ai binding.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  checkQuota,
  ensureQuotaRecord,
  assemblePrompt,
  extractArtifacts,
  getSettings,
  testProviderKey,
  extractListingUrls,
  runJinaReader,
  runTavilySearch,
  needsResearch,
  buildResearchContext,
  buildMultimodalParts,
} from '../director'
import type { D1Database, Ai } from '@cloudflare/workers-types'

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Mock D1 helpers ──────────────────────────────────────────────────────────

interface QuotaMockState {
  quota?: {
    user_id: string
    project_quota: number
    lifetime_created_count: number
    is_unlimited: number
    total_tokens_used: number
    total_spend_usd: number
  } | null
}

/**
 * A simple D1 mock that returns a configurable quota row from director_user_quotas.
 */
function makeQuotaDbQuota(state: QuotaMockState): D1Database {
  return {
    prepare: (query: string) => ({
      bind: () => ({
        first: async () => {
          const q = query.toLowerCase()
          if (q.includes('from director_user_quotas')) {
            return state.quota ?? null
          }
          return null
        },
        run: async () => ({ success: true, meta: { changes: 1 } }),
      }),
    }),
  } as unknown as D1Database
}

// ── Quota Enforcement ────────────────────────────────────────────────────────

describe('DIRECTOR.EXE — Quota Enforcement', () => {
  it('allows regular user to create 5th project within quota', async () => {
    const db = makeQuotaDbQuota({
      quota: {
        user_id: 'u1', project_quota: 5, lifetime_created_count: 4,
        is_unlimited: 0, total_tokens_used: 0, total_spend_usd: 0,
      },
    })
    const res = await checkQuota(db, 'u1', 'salesperson')
    expect(res.allowed).toBe(true)
  })

  it('rejects regular user attempting 6th project (at quota limit)', async () => {
    const db = makeQuotaDbQuota({
      quota: {
        user_id: 'u1', project_quota: 5, lifetime_created_count: 5,
        is_unlimited: 0, total_tokens_used: 0, total_spend_usd: 0,
      },
    })
    const res = await checkQuota(db, 'u1', 'salesperson')
    expect(res.allowed).toBe(false)
    expect(res.reason).toContain('quota')
  })

  it('allows broker creating 6th project (bypasses quota)', async () => {
    const db = makeQuotaDbQuota({
      quota: {
        user_id: 'u_broker', project_quota: 5, lifetime_created_count: 5,
        is_unlimited: 0, total_tokens_used: 0, total_spend_usd: 0,
      },
    })
    const res = await checkQuota(db, 'u_broker', 'broker')
    expect(res.allowed).toBe(true)
  })

  it('allows admin creating unlimited projects', async () => {
    const db = makeQuotaDbQuota({
      quota: {
        user_id: 'u_admin', project_quota: 5, lifetime_created_count: 99,
        is_unlimited: 0, total_tokens_used: 0, total_spend_usd: 0,
      },
    })
    const res = await checkQuota(db, 'u_admin', 'admin')
    expect(res.allowed).toBe(true)
  })

  it('allows unlimited users regardless of count', async () => {
    const db = makeQuotaDbQuota({
      quota: {
        user_id: 'u_unlim', project_quota: 5, lifetime_created_count: 100,
        is_unlimited: 1, total_tokens_used: 0, total_spend_usd: 0,
      },
    })
    const res = await checkQuota(db, 'u_unlim', 'salesperson')
    expect(res.allowed).toBe(true)
  })

  it('allows a first-time user with no quota record', async () => {
    const db = makeQuotaDbQuota({ quota: null })
    const res = await checkQuota(db, 'u_new', 'salesperson')
    expect(res.allowed).toBe(true)
  })
})

// ── ensureQuotaRecord ────────────────────────────────────────────────────────

describe('DIRECTOR.EXE — ensureQuotaRecord', () => {
  it('returns existing quota record if present', async () => {
    const existing = {
      user_id: 'u1', project_quota: 5, lifetime_created_count: 2,
      is_unlimited: 0, total_tokens_used: 0, total_spend_usd: 0,
    }
    const db = makeQuotaDbQuota({ quota: existing })
    const result = await ensureQuotaRecord(db, 'u1', 5)
    expect(result).toEqual(existing)
  })
})

// ── Artifact Extraction ──────────────────────────────────────────────────────

describe('DIRECTOR.EXE — Artifact Extraction', () => {
  it('extracts === delimited blocks (MLS_ENTRY.PKG style)', () => {
    const input = `[OK] MLS entry generated.

=== MLS_ENTRY.PKG v1 ===
FIELD: PUBLIC_REMARKS (320/800 chars)
A bright renovated 3BR with an open chef's kitchen.
=== END_STATE.DEF ===
THE_CLOSE: A family buying their forever home.`

    const artifacts = extractArtifacts(input)
    expect(artifacts.length).toBeGreaterThanOrEqual(2)
    const mls = artifacts.find((a) => a.title === 'MLS_ENTRY.PKG')
    expect(mls).toBeDefined()
    expect(mls!.content).toContain('PUBLIC_REMARKS')
    const endState = artifacts.find((a) => a.title === 'END_STATE.DEF')
    expect(endState).toBeDefined()
    expect(endState!.content).toContain('forever home')
  })

  it('extracts /path/file.md style virtual files', () => {
    const input = `Writing manuscript scene.

/manuscript/scenes/scene_01.md
INT. LIVING ROOM - DAY
The morning light spills across the wide plank floors.

/manuscript/scenes/scene_02.md
INT. KITCHEN - DAY
Quartz counters gleam.`

    const artifacts = extractArtifacts(input)
    const paths = artifacts.map((a) => a.filePath)
    expect(paths).toContain('/manuscript/scenes/scene_01.md')
    expect(paths).toContain('/manuscript/scenes/scene_02.md')
  })

  it('extracts files referenced as artifacts with csv type', () => {
    const input = `Here is the calendar.

=== CALENDAR.WK1 ===
DAY | PLATFORM | SCENE_SRC | STATUS
MON | Instagram | scene_01 | DRAFT`

    const artifacts = extractArtifacts(input)
    const cal = artifacts.find((a) => a.title === 'CALENDAR.WK1')
    expect(cal).toBeDefined()
    expect(cal!.content).toContain('Instagram')
  })
})

// ── Prompt Assembly ─────────────────────────────────────────────────────────

describe('DIRECTOR.EXE — Prompt Assembly', () => {
  function makeProjectDb(messages: Array<{ role: string; content: string }>): D1Database {
    return {
      prepare: (query: string) => ({
        bind: (...params: any[]) => {
          const projectId = params[0]
          const q = query.toLowerCase()
          if (q.includes('from director_projects')) {
            return {
              first: async () => ({
                id: projectId,
                state_summary: JSON.stringify({ address: '51 Maple St', active_phase: 'Phase 2' }),
              }),
            }
          }
          if (q.includes('from director_messages')) {
            return {
              // Real query is ORDER BY created_at DESC, so newest first (newest message is the assistant's)
              all: async () => ({
                results: [...messages].reverse().map((m) => ({ ...m, id: crypto.randomUUID(), project_id: projectId })),
              }),
            }
          }
          return { all: async () => ({ results: [] }), first: async () => null }
        },
      }),
    } as unknown as D1Database
  }

  it('prepends system prompt with project state JSON', async () => {
    const db = makeProjectDb([])
    const prompt = await assemblePrompt(db, 'proj1', 'You are DIRECTOR.EXE')
    expect(prompt[0].role).toBe('system')
    expect(prompt[0].content).toContain('You are DIRECTOR.EXE')
    expect(prompt[0].content).toContain('51 Maple St')
  })

  it('includes operator and assistant messages in chronological order', async () => {
    const db = makeProjectDb([
      { role: 'operator', content: 'The house is at 51 Maple' },
      { role: 'assistant', content: '[MLS_ADMIN] > Great, are we going live Friday?' },
    ])
    const prompt = await assemblePrompt(db, 'proj1', 'You are DIRECTOR.EXE')
    // system prompt + 2 messages = 3 entries
    expect(prompt.length).toBe(3)
    expect(prompt[1].role).toBe('user')
    expect(prompt[1].content).toContain('51 Maple')
    expect(prompt[2].role).toBe('assistant')
    expect(prompt[2].content).toContain('going live Friday')
  })
})

// ── Settings ─────────────────────────────────────────────────────────────────

describe('DIRECTOR.EXE — Settings', () => {
  it('returns global settings row', async () => {
    const db = {
      prepare: (q: string) => ({
        bind: () => ({
          first: async () => ({
            id: 'global',
            system_prompt: 'You are DIRECTOR.EXE',
            primary_model: 'gemini-2.0-flash',
            fallback_model: 'claude-3-5-sonnet-20241022',
            monthly_budget_usd: 15,
            default_user_quota: 5,
            gemini_api_key: null,
            anthropic_api_key: null,
            openai_api_key: null,
            kill_switch_active: 0,
            updated_at: '2026-01-01',
          }),
        }),
      }),
    } as unknown as D1Database
    const settings = await getSettings(db)
    expect(settings).not.toBeNull()
    expect(settings!.system_prompt).toContain('DIRECTOR.EXE')
    expect(settings!.monthly_budget_usd).toBe(15)
  })
})

// ── Provider Health Probe ────────────────────────────────────────────────────

describe('DIRECTOR.EXE — Provider Health Probe', () => {
  it('returns failure for unknown provider', async () => {
    const res = await testProviderKey('unknown', 'some-key')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Unknown provider')
  })
})

// ── Autonomous Web Intelligence ──────────────────────────────────────────────

describe('DIRECTOR.EXE — URL Extractor', () => {
  it('detects a listing URL in a message', () => {
    const urls = extractListingUrls('Here is the property: https://zillow.com/homedetails/51-Maple-St/BX1234_zpid/')
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('zillow.com')
  })

  it('detects multiple URLs and dedupes (strips trailing punctuation)', () => {
    const urls = extractListingUrls('See https://redfin.com/xyz and https://zillow.com/abc.')
    expect(urls).toHaveLength(2)
  })

  it('returns empty array when no URL present', () => {
    expect(extractListingUrls('no link here')).toEqual([])
  })
})

describe('DIRECTOR.EXE — Jina Reader URL Fetcher', () => {
  it('maps a live URL to the Jina Reader endpoint with encoded URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# 51 Maple St\n4 bd 3 ba · 2,450 sqft · Built 1998 · Renovated kitchen with quartz counters and stainless appliances.',
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await runJinaReader('https://zillow.com/homedetails/x/')
    expect(res.ok).toBe(true)
    expect(res.content).toContain('51 Maple St')

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('r.jina.ai/')
    expect(calledUrl).toContain('zillow.com')
  })

  it('returns error when Jina returns non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    const res = await runJinaReader('https://foo.com')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('429')
  })

  it('returns error when Jina returns no meaningful content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }))
    const res = await runJinaReader('https://foo.com')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('no meaningful content')
  })
})

describe('DIRECTOR.EXE — Tavily Search Fallback', () => {
  it('formats comp snippets from Tavily response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Median days on market in Bayside is 34.',
        results: [
          { title: 'Bayside Market Report', url: 'https://redfin.com', content: 'Prices up 3% YoY' },
        ],
      }),
    }))
    const res = await runTavilySearch('comps for 124-05 Liberty Ave Queens NY', 'tvly-key')
    expect(res.ok).toBe(true)
    expect(res.results?.some((s) => s.includes('34'))).toBe(true)
    expect(res.results?.some((s) => s.includes('[https://redfin.com]'))).toBe(true)

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body)
    expect(body.api_key).toBe('tvly-key')
    expect(body.max_results).toBe(5)
  })

  it('returns error on Tavily non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const res = await runTavilySearch('test', 'bad')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('401')
  })
})

describe('DIRECTOR.EXE — Research Intent Detection', () => {
  it('detects an address research request', () => {
    expect(needsResearch('Run research for 124-05 Liberty Ave, Queens NY')).toBe(true)
  })
  it('detects comps / market data requests', () => {
    expect(needsResearch('What are the comps in this neighborhood?')).toBe(true)
    expect(needsResearch('Show me the school district and tax record')).toBe(true)
  })
  it('does not flag generic messages', () => {
    expect(needsResearch('Write an instagram caption for the backyard')).toBe(false)
  })
})

describe('DIRECTOR.EXE — Research Context Formatting', () => {
  it('builds a sourced listing context block', () => {
    const ctx = buildResearchContext({
      searchResults: [],
      attachments: [],
      sourcedListing: 'SOURCE URL: https://zillow.com\n4 bd / 3 ba',
    })
    expect(ctx).toContain('=== SOURCED_LISTING_PAGE ===')
    expect(ctx).toContain('4 bd / 3 ba')
  })

  it('builds a research context block with citation URLs', () => {
    const ctx = buildResearchContext({
      searchResults: ['- Bayside stats [https://redfin.com]'],
      attachments: [],
    })
    expect(ctx).toContain('=== RESEARCH_CONTEXT (web-grounded) ===')
    expect(ctx).toContain('[https://redfin.com]')
  })
})

// ── Multimodal Payload Ingestion ─────────────────────────────────────────────

describe('DIRECTOR.EXE — Multimodal Payload Ingestion', () => {
  it('routes image attachments to inlineData parts for Gemini', () => {
    const { parts } = buildMultimodalParts([
      { name: 'livingroom.jpg', type: 'image/jpeg', dataBase64: 'aGVsbG8=' },
    ])
    expect(parts).toHaveLength(1)
    expect(parts[0].inlineData.mimeType).toBe('image/jpeg')
    expect(parts[0].inlineData.data).toBe('aGVsbG8=')
  })

  it('decodes PDF/text docs into ATTACHED_DOCUMENT context chunks', () => {
    const { parts, textContext } = buildMultimodalParts([
      { name: 'disclosure.pdf', type: 'application/pdf', dataBase64: 'ZmFjdHM+' },
    ])
    expect(parts).toHaveLength(0)
    expect(textContext).toContain('=== ATTACHED_DOCUMENT: disclosure.pdf ===')
    expect(textContext).toContain('facts')
  })
})
