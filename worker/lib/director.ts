/**
 * DIRECTOR.EXE — Backend Service Module
 *
 * Handles: AI inference routing, prompt assembly, quota enforcement,
 * artifact extraction, and cascading failover.
 */

import type { D1Database, Ai, R2Bucket } from '@cloudflare/workers-types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DirectorSettings {
  id: string
  system_prompt: string
  primary_model: string
  fallback_model: string
  monthly_budget_usd: number
  default_user_quota: number
  gemini_api_key: string | null
  anthropic_api_key: string | null
  openai_api_key: string | null
  tavily_api_key: string | null
  enable_web_grounding: number
  kill_switch_active: number
  updated_at: string
}

export interface ChatAttachment {
  name: string
  type: string
  dataBase64: string
}

export interface ResearchContext {
  sourcedListing?: string
  searchResults: string[]
  attachments: string[]
}

export interface DirectorUserQuota {
  user_id: string
  project_quota: number
  lifetime_created_count: number
  is_unlimited: number
  total_tokens_used: number
  total_spend_usd: number
  updated_at: string
}

export interface DirectorProject {
  id: string
  user_id: string
  tenant_id: string
  title: string
  property_address: string | null
  current_phase: string
  status: string
  state_summary: string | null
  created_at: string
  updated_at: string
}

export interface DirectorMessage {
  id: string
  project_id: string
  user_id: string
  role: 'operator' | 'assistant'
  speaker_tag: string | null
  content: string
  tokens_used: number
  created_at: string
}

export interface DirectorArtifact {
  id: string
  project_id: string
  file_path: string
  title: string
  content: string
  file_type: string
  r2_key: string | null
  created_at: string
}

export interface DirectorQuotaRequest {
  id: string
  user_id: string
  user_name: string
  user_email: string
  requested_pack: string
  amount_usd: number
  payment_note: string | null
  status: string
  created_at: string
  resolved_at: string | null
}

// ── Quota Enforcement ────────────────────────────────────────────────────────

export interface QuotaCheckResult {
  allowed: boolean
  reason?: string
  quota?: DirectorUserQuota
}

export async function checkQuota(
  db: D1Database,
  userId: string,
  userRole: string,
): Promise<QuotaCheckResult> {
  // Admin and broker roles bypass quota
  if (userRole === 'admin' || userRole === 'broker') {
    return { allowed: true }
  }

  const quota = await db
    .prepare('SELECT * FROM director_user_quotas WHERE user_id = ?')
    .bind(userId)
    .first<DirectorUserQuota>()

  // No quota record = first time user, allow with defaults
  if (!quota) {
    return { allowed: true }
  }

  // Unlimited users always pass
  if (quota.is_unlimited === 1) {
    return { allowed: true, quota }
  }

  // Check lifetime creation count
  if (quota.lifetime_created_count >= quota.project_quota) {
    return {
      allowed: false,
      reason: `Lifetime project quota reached (${quota.lifetime_created_count}/${quota.project_quota}). Submit an unlock request to create more.`,
      quota,
    }
  }

  return { allowed: true, quota }
}

export async function ensureQuotaRecord(
  db: D1Database,
  userId: string,
  defaultQuota: number,
): Promise<DirectorUserQuota> {
  const existing = await db
    .prepare('SELECT * FROM director_user_quotas WHERE user_id = ?')
    .bind(userId)
    .first<DirectorUserQuota>()

  if (existing) return existing

  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO director_user_quotas (user_id, project_quota, lifetime_created_count, is_unlimited, total_tokens_used, total_spend_usd, updated_at)
       VALUES (?, ?, 0, 0, 0, 0.0, ?)`
    )
    .bind(userId, defaultQuota, now)
    .run()

  return (await db
    .prepare('SELECT * FROM director_user_quotas WHERE user_id = ?')
    .bind(userId)
    .first<DirectorUserQuota>())!
}

export async function incrementLifetimeCount(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE director_user_quotas
       SET lifetime_created_count = lifetime_created_count + 1,
           updated_at = datetime('now')
       WHERE user_id = ?`
    )
    .bind(userId)
    .run()
}

// ── Prompt Assembly ──────────────────────────────────────────────────────────

const MAX_CONTEXT_MESSAGES = 8

export async function assemblePrompt(
  db: D1Database,
  projectId: string,
  systemPrompt: string,
): Promise<Array<{ role: string; content: string }>> {
  // Load project state summary
  const project = await db
    .prepare('SELECT * FROM director_projects WHERE id = ?')
    .bind(projectId)
    .first<DirectorProject>()

  const stateJson = project?.state_summary || '{}'

  // Load last N messages
  const messages = await db
    .prepare(
      `SELECT role, content FROM director_messages
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(projectId, MAX_CONTEXT_MESSAGES)
    .all<DirectorMessage>()

  const reversedMessages = [...(messages.results || [])].reverse()

  const contextMessages: Array<{ role: string; content: string }> = [
    {
      role: 'system',
      content: `${systemPrompt}\n\n# PROJECT STATE (JSON)\n\`\`\`json\n${stateJson}\n\`\`\``,
    },
    ...reversedMessages.map((m) => ({
      role: m.role === 'operator' ? 'user' : 'assistant',
      content: m.content,
    })),
  ]

  return contextMessages
}

// ── AI Inference Engine ──────────────────────────────────────────────────────

interface InferenceRequest {
  messages: Array<{ role: string; content: string }>
  settings: DirectorSettings
  ai: Ai
  attachments?: ChatAttachment[]
}

interface InferenceResult {
  content: string
  model: string
  tokensUsed: number
}

/**
 * Attempts inference with cascading failover:
 * 1. Try Groq (if key set or requested — ultra fast free Llama 3.3 70B)
 * 2. Try Gemini (with native Google Search grounding + vision)
 * 3. Try Workers AI (free tier Llama 3.3 70B / Llama 3.2 Vision)
 * 4. Try OpenRouter (if key set)
 * 5. On 429 / rate limit, fall back further (Anthropic Claude / OpenAI)
 */
export async function runInference(
  request: InferenceRequest,
): Promise<InferenceResult> {
  const { messages, settings, ai, attachments } = request
  const errors: string[] = []

  const isGroqPrimary = settings.primary_model?.toLowerCase().includes('groq')
  const isGeminiPrimary = settings.primary_model?.toLowerCase().includes('gemini')
  const isOpenRouterPrimary = settings.primary_model?.toLowerCase().includes('openrouter')

  // 1. Groq (if key configured and requested or primary)
  if (settings.groq_api_key && (isGroqPrimary || (!isGeminiPrimary && !isOpenRouterPrimary))) {
    try {
      const groqModel = settings.primary_model?.startsWith('groq:')
        ? settings.primary_model.replace('groq:', '')
        : 'llama-3.3-70b-versatile'
      const result = await runGroq(messages, settings.groq_api_key, groqModel)
      return { ...result, model: `groq:${groqModel}` }
    } catch (e: any) {
      errors.push(`Groq: ${e?.message || e}`)
    }
  }

  // 2. Google Gemini API (if key configured)
  if (settings.gemini_api_key && isGeminiPrimary) {
    try {
      const result = await runGemini(
        messages,
        settings.gemini_api_key,
        settings.enable_web_grounding === 1,
        attachments,
      )
      return { ...result, model: settings.primary_model || 'gemini-2.0-flash' }
    } catch (e: any) {
      errors.push(`Gemini: ${e?.message || e}`)
    }
  }

  // 3. Cloudflare Workers AI (if ai binding is available)
  if (ai) {
    try {
      const cfModel = settings.primary_model?.startsWith('@cf/')
        ? settings.primary_model
        : '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
      const result = await runWorkersAi(messages, ai, cfModel, attachments)
      return { ...result, model: cfModel }
    } catch (e: any) {
      errors.push(`Workers AI: ${e?.message || e}`)
    }
  }

  // 4. OpenRouter (if key configured)
  if (settings.openrouter_api_key) {
    try {
      const orModel = settings.primary_model?.startsWith('openrouter:')
        ? settings.primary_model.replace('openrouter:', '')
        : 'meta-llama/llama-3.3-70b-instruct:free'
      const result = await runOpenRouter(messages, settings.openrouter_api_key, orModel)
      return { ...result, model: `openrouter:${orModel}` }
    } catch (e: any) {
      errors.push(`OpenRouter: ${e?.message || e}`)
    }
  }

  // 5. Fallback: Groq (if key exists and wasn't tried)
  if (settings.groq_api_key && !isGroqPrimary) {
    try {
      const result = await runGroq(messages, settings.groq_api_key, 'llama-3.3-70b-versatile')
      return { ...result, model: 'groq:llama-3.3-70b-versatile' }
    } catch (e: any) {
      errors.push(`Groq: ${e?.message || e}`)
    }
  }

  // 6. Fallback: Gemini (if key exists and wasn't tried)
  if (settings.gemini_api_key && !isGeminiPrimary) {
    try {
      const result = await runGemini(
        messages,
        settings.gemini_api_key,
        settings.enable_web_grounding === 1,
        attachments,
      )
      return { ...result, model: 'gemini-2.0-flash' }
    } catch (e: any) {
      errors.push(`Gemini: ${e?.message || e}`)
    }
  }

  // 7. Fallback: Anthropic Claude (budget-bounded)
  if (settings.anthropic_api_key && settings.monthly_budget_usd > 0) {
    try {
      const result = await runAnthropic(messages, settings.anthropic_api_key)
      return { ...result, model: 'claude-3-5-sonnet' }
    } catch (e: any) {
      const isBudget = e?.message?.includes('429') || e?.message?.includes('budget')
      if (isBudget) {
        throw new Error('[QUOTA LIMIT] Monthly AI budget cap reached. Contact admin.')
      }
      errors.push(`Anthropic: ${e?.message || e}`)
    }
  }

  // 8. Fallback: OpenAI GPT-4o (budget-bounded)
  if (settings.openai_api_key && settings.monthly_budget_usd > 0) {
    try {
      const result = await runOpenAI(messages, settings.openai_api_key)
      return { ...result, model: 'gpt-4o' }
    } catch (e: any) {
      errors.push(`OpenAI: ${e?.message || e}`)
    }
  }

  throw new Error(`[ERR] All inference providers exhausted. ${errors.length > 0 ? errors.join(' | ') : 'No valid API keys configured.'}`)
}

async function runWorkersAi(
  messages: Array<{ role: string; content: string }>,
  ai: Ai,
  model: string,
  attachments?: ChatAttachment[],
): Promise<{ content: string; tokensUsed: number }> {
  // Normalize model ID to official Cloudflare catalog
  let normalizedModel = model
  if (normalizedModel.includes('llama-3.3-70b')) {
    normalizedModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  } else if (normalizedModel.includes('llama-3.1-8b')) {
    normalizedModel = '@cf/meta/llama-3.1-8b-instruct-fast'
  } else if (!normalizedModel.startsWith('@cf/')) {
    normalizedModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  }

  // If images are attached, prefer a vision-capable model (Llama 3.2 Vision).
  const hasImages = (attachments || []).some((a) => (a.type || '').startsWith('image/'))
  const modelId = hasImages
    ? '@cf/meta/llama-3.2-11b-vision-instruct'
    : normalizedModel

  // Decode base64 image attachments for the vision model.
  const images = (attachments || [])
    .filter((a) => (a.type || '').startsWith('image/'))
    .map((a) => ({
      type: a.type,
      data: atob(a.dataBase64),
    }))

  const payload: any = {
    messages: (messages || []).map((m) => ({
      role: m.role,
      content: images.length > 0 && m.role === 'user'
        ? [
            ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } })),
            { type: 'text', text: m.content },
          ]
        : m.content,
    })),
    max_tokens: 4096,
    stream: false,
  }

  const response = await ai.run(modelId, payload)

  const result = response as any
  const content = result?.response || result?.choices?.[0]?.message?.content || ''
  const tokensUsed = result?.usage?.total_tokens || estimateTokens(content)

  return { content, tokensUsed }
}

async function runGemini(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  enableGrounding: boolean,
  attachments?: ChatAttachment[],
): Promise<{ content: string; tokensUsed: number }> {
  const modelCandidates = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
  let lastErr = ''

  // Build multimodal parts from image attachments.
  const { parts: imageParts } = buildMultimodalParts(attachments)

  // Convert to Gemini format; only the last user message carries inline images.
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m, idx) => {
      const isLastUser = m.role !== 'assistant' && idx === messages.filter((x) => x.role !== 'system').length - 1
      const parts: any[] = imageParts.length > 0 && isLastUser
        ? [...imageParts, { text: m.content }]
        : [{ text: m.content }]
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      }
    })

  const systemInstruction = messages.find((m) => m.role === 'system')

  const body: any = { contents }
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] }
  }
  if (enableGrounding) {
    body.tools = [{ googleSearch: {} }]
  }

  for (const model of modelCandidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json<any>()
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const tokensUsed = data?.usageMetadata?.totalTokenCount || estimateTokens(content)
      return { content, tokensUsed }
    }

    lastErr = `Gemini API error ${res.status} on ${model}`
    if (res.status !== 404) {
      throw new Error(lastErr)
    }
  }

  throw new Error(lastErr || 'Gemini API failed on all candidate models')
}

async function runAnthropic(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
): Promise<{ content: string; tokensUsed: number }> {
  const systemMsg = messages.find((m) => m.role === 'system')
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemMsg?.content || '',
      messages: chatMessages,
    }),
  })

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`)
  }

  const data = await res.json<any>()
  const content = data?.content?.[0]?.text || ''
  const tokensUsed =
    (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0)

  return { content, tokensUsed }
}

async function runOpenAI(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
): Promise<{ content: string; tokensUsed: number }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  })

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`)
  }

  const data = await res.json<any>()
  const content = data?.choices?.[0]?.message?.content || ''
  const tokensUsed = data?.usage?.total_tokens || estimateTokens(content)

  return { content, tokensUsed }
}

async function runGroq(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  model = 'llama-3.3-70b-versatile',
): Promise<{ content: string; tokensUsed: number }> {
  const modelId = model.replace(/^groq:/, '') || 'llama-3.3-70b-versatile'
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Groq API error ${res.status}: ${errText}`)
  }

  const data = await res.json<any>()
  let rawContent = data?.choices?.[0]?.message?.content || ''
  // Strip internal DeepSeek R1 reasoning tags if present
  const content = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const tokensUsed = data?.usage?.total_tokens || estimateTokens(content)

  return { content, tokensUsed }
}

async function runOpenRouter(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  model = 'meta-llama/llama-3.3-70b-instruct:free',
): Promise<{ content: string; tokensUsed: number }> {
  const modelId = model.replace(/^openrouter:/, '') || 'meta-llama/llama-3.3-70b-instruct:free'
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://workspace.primeamericany.com',
      'X-Title': 'Prime America RE Workspace',
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenRouter API error ${res.status}: ${errText}`)
  }

  const data = await res.json<any>()
  const content = data?.choices?.[0]?.message?.content || ''
  const tokensUsed = data?.usage?.total_tokens || estimateTokens(content)

  return { content, tokensUsed }
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4)
}

// ── Autonomous Web Intelligence ──────────────────────────────────────────────

/**
 * Extracts all http(s) URLs from a message. Returns unique, trimmed URLs.
 */
export function extractListingUrls(message: string): string[] {
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi
  const matches = message.match(urlRegex) || []
  return [...new Set(matches.map((u) => u.trim()))]
}

/**
 * Fetches a live page (listing URL, etc.) via Jina Reader and converts it
 * into clean, LLM-ready markdown. No API key required.
 */
export async function runJinaReader(url: string): Promise<{
  ok: boolean
  content?: string
  error?: string
}> {
  const encoded = encodeURIComponent(url)
  try {
    const res = await fetch(`https://r.jina.ai/${encoded}`, {
      headers: { Accept: 'text/markdown' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      return { ok: false, error: `Jina Reader error: ${res.status}` }
    }
    const content = await res.text()
    if (!content || content.trim().length < 50) {
      return { ok: false, error: 'Jina Reader returned no meaningful content' }
    }
    return { ok: true, content }
  } catch (e: any) {
    return { ok: false, error: `Jina Reader failed: ${e?.message || e}` }
  }
}

/**
 * Runs a Tavily search for autonomous agent research. Returns top comp/market
 * snippets formatted for prompt injection.
 */
export async function runTavilySearch(
  query: string,
  apiKey: string,
  maxResults = 5,
): Promise<{
  ok: boolean
  results?: string[]
  error?: string
}> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: maxResults,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      return { ok: false, error: `Tavily API error: ${res.status}` }
    }

    const data = await res.json<{
      answer?: string
      results?: Array<{ title: string; url: string; content: string }>
    }>()

    const snippets: string[] = []
    if (data.answer) {
      snippets.push(`ANSWER: ${data.answer}`)
    }
    for (const r of (data.results || []).slice(0, maxResults)) {
      snippets.push(`- ${r.title} [${r.url}]\n  ${(r.content || '').slice(0, 800)}`)
    }

    return { ok: true, results: snippets }
  } catch (e: any) {
    return { ok: false, error: `Tavily search failed: ${e?.message || e}` }
  }
}

/**
 * Detects whether a message likely needs web research (addresses, neighborhoods,
 * comps, schools, market data, tax info).
 */
export function needsResearch(message: string): boolean {
  const re = /(\b\d{1,6}\s\b[\w\s.,#'-]*(st|ave|rd|blvd|dr|ln|way|pl|ct|avenue|street|road|boulevard)\b)|(comps?|comparab|neighborhood|school district|market data|tax record|square footage|zillow|redfin|realtor\.com)/i
  return re.test(message)
}

/**
 * Builds a context block summarizing sourced research for prompt injection.
 */
export function buildResearchContext(r: ResearchContext): string {
  const parts: string[] = []

  if (r.sourcedListing) {
    parts.push(`=== SOURCED_LISTING_PAGE ===\n${r.sourcedListing}\n=== END_SOURCED_LISTING_PAGE ===`)
  }

  if (r.searchResults.length > 0) {
    parts.push(`=== RESEARCH_CONTEXT (web-grounded) ===\n${r.searchResults.join('\n\n')}\n=== END_RESEARCH_CONTEXT ===`)
  }

  if (r.attachments.length > 0) {
    parts.push(r.attachments.join('\n\n'))
  }

  return parts.join('\n\n')
}

/**
 * Resolves research for a chat turn: fetches listing URLs via Jina Reader and
 * runs Tavily search for research-intent messages.
 */
export async function gatherResearchContext(
  message: string,
  settings: DirectorSettings,
): Promise<ResearchContext> {
  const ctx: ResearchContext = { searchResults: [], attachments: [] }

  // 1. URL fetching (always, regardless of grounding toggle — free, no key)
  const urls = extractListingUrls(message)
  if (urls.length > 0) {
    const url = urls[0]
    const fetched = await runJinaReader(url)
    if (fetched.ok && fetched.content) {
      ctx.sourcedListing = `SOURCE URL: ${url}\n\n${fetched.content.slice(0, 6000)}`
    }
  }

  // 2. Tavily fallback search (only if grounding enabled and key present)
  if (settings.enable_web_grounding === 1 && settings.tavily_api_key && needsResearch(message)) {
    const search = await runTavilySearch(message, settings.tavily_api_key)
    if (search.ok && search.results && search.results.length > 0) {
      ctx.searchResults = search.results
    }
  }

  return ctx
}

/**
 * Decodes base64 image data into a data URI for vision-capable models.
 */
export function imageToDataUri(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`
}

/**
 * Builds multimodal content parts for Gemini from base64 attachments.
 * Returns an array of Gemini content parts, plus extracted text from PDFs.
 */
export function buildMultimodalParts(
  attachments: ChatAttachment[] | undefined,
): { parts: Array<{ inlineData: { mimeType: string; data: string } }>; textContext: string } {
  const parts: Array<{ inlineData: { mimeType: string; data: string } }> = []
  const textChunks: string[] = []

  for (const att of attachments || []) {
    const mime = (att.type || '').toLowerCase()
    if (mime.startsWith('image/')) {
      parts.push({ inlineData: { mimeType: mime, data: att.dataBase64 } })
    } else {
      // PDFs / text docs: decode best-effort text
      try {
        const text = atob(att.dataBase64)
        textChunks.push(`=== ATTACHED_DOCUMENT: ${att.name} ===\n${text.slice(0, 8000)}\n=== END_ATTACHED_DOCUMENT ===`)
      } catch {
        textChunks.push(`=== ATTACHED_DOCUMENT: ${att.name} (unreadable binary) ===`)
      }
    }
  }

  return { parts, textContext: textChunks.join('\n\n') }
}

// ── Artifact Extraction ──────────────────────────────────────────────────────

interface ExtractedArtifact {
  filePath: string
  title: string
  content: string
  fileType: string
}

/**
 * Parses AI output for virtual file paths and delimited blocks.
 * Strips conversational terminal logs/dialogue so deliverable files remain clean.
 */
export function extractArtifacts(text: string): ExtractedArtifact[] {
  const artifacts: ExtractedArtifact[] = []

  function sanitizeArtifactContent(raw: string): string {
    // 1. Strip everything after closing delimiter if present
    let content = raw.split(/={3,}/)[0]

    // 2. If the model started conversational chatter / routing logs without closing ===, strip it
    const chatterRegex = /\n\s*(?:\[(?:\?\?|OK|\.\.|!!|ERR)\]|\[[A-Z_]+\]\s*>|operator@director:)/
    const chatterIndex = content.search(chatterRegex)
    if (chatterIndex !== -1) {
      content = content.slice(0, chatterIndex)
    }

    return content.trim()
  }

  // Extract === delimited blocks (=== MLS_ENTRY.PKG v1 ===, === END_STATE.DEF ===, etc.)
  const blockRegex = /===\s*([A-Za-z0-9_.\s]*?)\s*===/g
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(text)) !== null) {
    // Strip trailing version suffix (e.g. "MLS_ENTRY.PKG v1" -> "MLS_ENTRY.PKG")
    const blockName = match[1].trim().replace(/\s+v\d+\s*$/i, '').trim()
    const startIdx = match.index + match[0].length
    // Find next === or end of text
    const nextBlock = text.indexOf('===', startIdx)
    const rawContent = text.slice(startIdx, nextBlock === -1 ? undefined : nextBlock)
    const blockContent = sanitizeArtifactContent(rawContent)

    if (blockContent) {
      const ext = blockName.endsWith('.pkg') ? 'json' : 'markdown'
      artifacts.push({
        filePath: `/${blockName.toLowerCase().replace(/_/g, '-')}.${ext}`,
        title: blockName,
        content: blockContent,
        fileType: ext,
      })
    }
  }

  // Extract /path/file.md style files
  const contentBySection: Record<string, string> = {}

  // Split by headings or file paths to get content sections
  const lines = text.split('\n')
  let currentPath = ''
  let currentContent: string[] = []

  for (const line of lines) {
    const pathMatch = line.match(/((?:\/[\w-]+)+\/[\w-]+\.(?:md|csv|json|txt))/)
    if (pathMatch) {
      if (currentPath && currentContent.length > 0) {
        contentBySection[currentPath] = sanitizeArtifactContent(currentContent.join('\n'))
      }
      currentPath = pathMatch[1]
      currentContent = []
    } else if (currentPath) {
      currentContent.push(line)
    }
  }

  if (currentPath && currentContent.length > 0) {
    contentBySection[currentPath] = sanitizeArtifactContent(currentContent.join('\n'))
  }

  for (const [filePath, content] of Object.entries(contentBySection)) {
    if (!artifacts.some((a) => a.filePath === filePath) && content) {
      const ext = filePath.split('.').pop() || 'markdown'
      const title = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || filePath
      artifacts.push({
        filePath,
        title,
        content,
        fileType: ext === 'md' ? 'markdown' : ext,
      })
    }
  }

  return artifacts
}

// ── Settings Management ──────────────────────────────────────────────────────

export async function getSettings(db: D1Database): Promise<DirectorSettings | null> {
  return db
    .prepare('SELECT * FROM director_settings WHERE id = ?')
    .bind('global')
    .first<DirectorSettings>()
}

export async function updateSettings(
  db: D1Database,
  updates: Partial<Pick<DirectorSettings, 'system_prompt' | 'primary_model' | 'fallback_model' | 'monthly_budget_usd' | 'default_user_quota' | 'kill_switch_active' | 'enable_web_grounding'>>
): Promise<void> {
  const fields: string[] = []
  const values: any[] = []

  if (updates.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(updates.system_prompt) }
  if (updates.primary_model !== undefined) { fields.push('primary_model = ?'); values.push(updates.primary_model) }
  if (updates.fallback_model !== undefined) { fields.push('fallback_model = ?'); values.push(updates.fallback_model) }
  if (updates.monthly_budget_usd !== undefined) { fields.push('monthly_budget_usd = ?'); values.push(updates.monthly_budget_usd) }
  if (updates.default_user_quota !== undefined) { fields.push('default_user_quota = ?'); values.push(updates.default_user_quota) }
  if (updates.kill_switch_active !== undefined) { fields.push('kill_switch_active = ?'); values.push(updates.kill_switch_active) }
  if (updates.enable_web_grounding !== undefined) { fields.push('enable_web_grounding = ?'); values.push(updates.enable_web_grounding) }

  if (fields.length === 0) return

  fields.push("updated_at = datetime('now')")
  values.push('global')

  await db
    .prepare(`UPDATE director_settings SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()
}

// ── API Key Management ───────────────────────────────────────────────────────

export async function saveApiKey(
  db: D1Database,
  provider: 'gemini_api_key' | 'anthropic_api_key' | 'openai_api_key' | 'groq_api_key' | 'openrouter_api_key' | 'tavily_api_key',
  key: string,
): Promise<void> {
  await db
    .prepare(`UPDATE director_settings SET ${provider} = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(key, 'global')
    .run()
}

/**
 * Live probe: sends a minimal request to verify API key validity.
 * Returns { ok, latencyMs, error? }
 */
export async function testProviderKey(
  provider: string,
  apiKey: string,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()

  try {
    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return { ok: res.ok, latencyMs: Date.now() - start }
    }

    if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return { ok: res.ok, latencyMs: Date.now() - start }
    }

    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      )
      return { ok: res.ok, latencyMs: Date.now() - start }
    }

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
      return { ok: res.ok, latencyMs: Date.now() - start }
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return { ok: res.ok, latencyMs: Date.now() - start }
    }

    if (provider === 'tavily') {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query: 'prime america real estate', max_results: 1 }),
      })
      return { ok: res.ok, latencyMs: Date.now() - start }
    }

    return { ok: false, latencyMs: Date.now() - start, error: 'Unknown provider' }
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - start, error: e.message }
  }
}

// ── Spend Tracking ───────────────────────────────────────────────────────────

export async function trackSpend(
  db: D1Database,
  userId: string,
  tokensUsed: number,
  model: string,
): Promise<void> {
  // Estimate cost: Workers AI free tier = $0, Gemini Flash ≈ $0.075/1M input, $0.30/1M output
  // Simplified: assume ~$0.00002 per token for paid models
  const isFreeModel = model.includes('@cf/') || model.includes('llama')
  const estimatedCost = isFreeModel ? 0 : tokensUsed * 0.00002

  await db
    .prepare(
      `UPDATE director_user_quotas
       SET total_tokens_used = total_tokens_used + ?,
           total_spend_usd = total_spend_usd + ?,
           updated_at = datetime('now')
       WHERE user_id = ?`
    )
    .bind(tokensUsed, estimatedCost, userId)
    .run()
}
