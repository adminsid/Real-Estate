/**
 * DIRECTOR.EXE — API Routes Handler
 *
 * All /api/director/* routes. Requires auth session for all calls.
 * Admin routes additionally require role == 'admin' or 'broker'.
 */

import type { D1Database, Ai, R2Bucket } from '@cloudflare/workers-types'
import type { AuthSession } from './auth'
import {
  checkQuota,
  ensureQuotaRecord,
  incrementLifetimeCount,
  assemblePrompt,
  runInference,
  extractArtifacts,
  getSettings,
  updateSettings,
  saveApiKey,
  testProviderKey,
  trackSpend,
  gatherResearchContext,
  buildResearchContext,
  buildMultimodalParts,
  extractListingUrls,
} from './director'
import type { ChatAttachment } from './director'

export interface DirectorEnv {
  DB: D1Database
  AI: Ai
  ASSETS_BUCKET: R2Bucket
  DIRECTOR_DEFAULT_QUOTA?: string
  DIRECTOR_MONTHLY_BUDGET_USD?: string
}

function json<T>(data: T, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function ok<T>(data: T, extra: Record<string, string> = {}): Response {
  return json({ success: true, data }, 200, extra)
}

function err(message: string, status = 400): Response {
  return json({ success: false, error: message }, status)
}

function isAdmin(session: AuthSession): boolean {
  return session.role === 'admin' || session.role === 'broker'
}

function defaultQuota(env: DirectorEnv): number {
  const raw = env.DIRECTOR_DEFAULT_QUOTA
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) ? parsed : 5
}

/**
 * Entry point for /api/director/* routes.
 * Returns a Response, or null if the path is not a director route.
 */
export async function handleDirectorRequest(
  request: Request,
  env: DirectorEnv,
  path: string,
  session: AuthSession,
): Promise<Response | null> {
  const method = request.method
  const db = env.DB

  // ── GET /api/director/projects ────────────────────────────────────────────
  if (path === '/api/director/projects' && method === 'GET') {
    const { results } = await db
      .prepare(
        `SELECT * FROM director_projects
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .bind(session.userId)
      .all()

    const quota = await ensureQuotaRecord(db, session.userId, defaultQuota(env))

    return ok({
      projects: results || [],
      quota: {
        projectQuota: quota.project_quota,
        lifetimeCreatedCount: quota.lifetime_created_count,
        isUnlimited: quota.is_unlimited === 1,
        totalTokensUsed: quota.total_tokens_used,
      },
    })
  }

  // ── POST /api/director/projects ───────────────────────────────────────────
  if (path === '/api/director/projects' && method === 'POST') {
    const body = await request.json<{ title: string; propertyAddress?: string }>().catch(() => null)
    if (!body?.title) return err('Project title is required')

    // Check kill switch
    const settings = await getSettings(db)
    if (settings?.kill_switch_active === 1) {
      return err('[QUOTA LIMIT] DIRECTOR.EXE is temporarily offline for maintenance.', 503)
    }

    // Enforce quota
    const quotaCheck = await checkQuota(db, session.userId, session.role)
    if (!quotaCheck.allowed) {
      return json(
        { success: false, error: quotaCheck.reason, code: 'QUOTA_EXCEEDED', data: { quota: quotaCheck.quota } },
        403,
      )
    }

    // Create project
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await db
      .prepare(
        `INSERT INTO director_projects (id, user_id, tenant_id, title, property_address, current_phase, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'Phase 0: DISCOVERY', 'active', ?, ?)`
      )
      .bind(id, session.userId, session.tenantId, body.title, body.propertyAddress || null, now, now)
      .run()

    // Initialize state summary
    const stateSummary = JSON.stringify({
      address: body.propertyAddress || '',
      avatar: null,
      close_reason: null,
      approved_scenes: [],
      active_phase: 'Phase 0: DISCOVERY',
    })
    await db
      .prepare('UPDATE director_projects SET state_summary = ? WHERE id = ?')
      .bind(stateSummary, id)
      .run()

    // Increment lifetime count
    await ensureQuotaRecord(db, session.userId, defaultQuota(env))
    await incrementLifetimeCount(db, session.userId)

    // Insert boot message
    await db
      .prepare(
        `INSERT INTO director_messages (id, project_id, user_id, role, speaker_tag, content, created_at)
         VALUES (?, ?, ?, 'assistant', '[DIRECTOR]', ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        id,
        session.userId,
        `DIRECTOR.EXE v2.0 boot sequence complete.\n[OK] New project initialized: ${body.title}\n[OK] Phase 0: DISCOVERY\n\n[??] To begin, tell me about the property we're selling. Give me the address, your goal, and timeline if you have them. I'll handle the strategy.`,
        now,
      )
      .run()

    return ok({ id })
  }

  // ── PATCH /api/director/projects/:id/archive ──────────────────────────────
  const archiveMatch = path.match(/^\/api\/director\/projects\/([^/]+)\/archive$/)
  if (archiveMatch && method === 'PATCH') {
    const projectId = archiveMatch[1]
    const project = await db
      .prepare('SELECT * FROM director_projects WHERE id = ? AND user_id = ?')
      .bind(projectId, session.userId)
      .first()

    if (!project) return err('Project not found', 404)

    const newStatus = project.status === 'archived' ? 'active' : 'archived'
    await db
      .prepare('UPDATE director_projects SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(newStatus, projectId)
      .run()

    return ok({ status: newStatus })
  }

  // ── GET /api/director/projects/:id ────────────────────────────────────────
  const projectGetMatch = path.match(/^\/api\/director\/projects\/([^/]+)$/)
  if (projectGetMatch && method === 'GET') {
    const projectId = projectGetMatch[1]
    const project = await db
      .prepare('SELECT * FROM director_projects WHERE id = ? AND user_id = ?')
      .bind(projectId, session.userId)
      .first()

    if (!project) return err('Project not found', 404)

    const messages = await db
      .prepare(
        `SELECT * FROM director_messages
         WHERE project_id = ?
         ORDER BY created_at ASC`
      )
      .bind(projectId)
      .all()

    const artifacts = await db
      .prepare(
        `SELECT * FROM director_artifacts
         WHERE project_id = ?
         ORDER BY created_at ASC`
      )
      .bind(projectId)
      .all()

    return ok({
      project,
      messages: messages.results || [],
      artifacts: artifacts.results || [],
    })
  }

  // ── POST /api/director/chat ───────────────────────────────────────────────
  if (path === '/api/director/chat' && method === 'POST') {
    const body = await request.json<{ projectId: string; message: string; attachments?: ChatAttachment[] }>()
    if (!body?.projectId || !body?.message?.trim()) {
      return err('Project ID and message are required')
    }

    // Check kill switch
    const settings = await getSettings(db)
    if (settings?.kill_switch_active === 1) {
      return err('[QUOTA LIMIT] DIRECTOR.EXE is temporarily offline for maintenance.', 503)
    }

    // Verify project ownership
    const project = await db
      .prepare('SELECT * FROM director_projects WHERE id = ? AND user_id = ?')
      .bind(body.projectId, session.userId)
      .first()

    if (!project) return err('Project not found', 404)

    // ── Run autonomous research (URL fetching + web search) ────────────────
    const progressLog: string[] = []
    const attachments = Array.isArray(body.attachments) ? body.attachments : []

    // 1. Detect listing URLs
    const detectedUrls = extractListingUrls(body.message)
    if (detectedUrls.length > 0) {
      progressLog.push(`[..] URL detected: ${detectedUrls[0]}`)
      progressLog.push('[..] Fetching live listing specs via Jina Reader...')
    }

    const research = await gatherResearchContext(body.message, settings)
    if (research.sourcedListing) {
      progressLog.push('[OK] Jina Reader: listing page converted to clean markdown.')
    }
    if (research.searchResults.length > 0) {
      progressLog.push('[OK] Web search: network absorption rate & comps resolved via Tavily.')
    }
    if (attachments.length > 0) {
      const imgCount = attachments.filter((a) => (a.type || '').startsWith('image/')).length
      const docCount = attachments.length - imgCount
      progressLog.push(`[..] Ingesting ${imgCount} photo(s)${docCount > 0 ? ` + ${docCount} document(s)` : ''} for multimodal analysis...`)
    }

    // 1. Insert operator message FIRST so it is included in conversation history
    const now = new Date().toISOString()
    await db
      .prepare(
        `INSERT INTO director_messages (id, project_id, user_id, role, speaker_tag, content, created_at)
         VALUES (?, ?, ?, 'operator', '[OPERATOR]', ?, ?)`
      )
      .bind(crypto.randomUUID(), body.projectId, session.userId, body.message, now)
      .run()

    // 2. Build prompt with latest operator message + research + attachment context injected
    const basePrompt = await assemblePrompt(db, body.projectId, settings.system_prompt)

    // Append a grounded context block to the final user (operator) turn so the
    // model has live facts + attachment text before answering.
    const context = buildResearchContext(research)
    const { textContext } = buildMultimodalParts(attachments)

    const prompt = basePrompt.map((m, idx) => {
      if (idx === basePrompt.length - 1 && m.role === 'user' && (context || textContext)) {
        return {
          ...m,
          content: `${m.content}\n\n# GROUNDED CONTEXT (do not fabricate beyond this)\n${[context, textContext].filter(Boolean).join('\n\n')}`,
        }
      }
      return m
    })

    // Run inference with cascading failover
    let result: { content: string; model: string; tokensUsed: number }
    try {
      result = await runInference({
        messages: prompt,
        settings,
        ai: env.AI as any,
        attachments,
      })
    } catch (e: any) {
      console.error('DIRECTOR inference failed:', e)
      if (e?.message?.includes('QUOTA LIMIT')) {
        return err(e.message, 402)
      }
      return err(e?.message || 'AI inference failed', 500)
    }

    // Extract artifacts from response
    const artifacts = extractArtifacts(result.content)

    // Insert assistant message
    await db
      .prepare(
        `INSERT INTO director_messages (id, project_id, user_id, role, speaker_tag, content, tokens_used, created_at)
         VALUES (?, ?, ?, 'assistant', '[DIRECTOR]', ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        body.projectId,
        session.userId,
        result.content,
        result.tokensUsed,
        now,
      )
      .run()

    // Track spend
    await trackSpend(db, session.userId, result.tokensUsed, result.model)

    // Save artifacts
    for (const artifact of artifacts) {
      await db
        .prepare(
          `INSERT INTO director_artifacts (id, project_id, file_path, title, content, file_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          body.projectId,
          artifact.filePath,
          artifact.title,
          artifact.content,
          artifact.fileType,
          now,
        )
        .run()
    }

    // Persist the live-research context as a deliverable artifact (if any).
    if (research.sourcedListing || research.searchResults.length > 0) {
      const researchContent = [
        research.sourcedListing ? `SOURCE URL:\n${research.sourcedListing}` : '',
        research.searchResults.length > 0 ? `SEARCH RESULTS:\n${research.searchResults.join('\n\n')}` : '',
      ].filter(Boolean).join('\n\n')
      await db
        .prepare(
          `INSERT INTO director_artifacts (id, project_id, file_path, title, content, file_type, created_at)
           VALUES (?, ?, '/research/brief.log', 'RESEARCH_BRIEF.LOG', ?, 'markdown', ?)`
        )
        .bind(crypto.randomUUID(), body.projectId, researchContent, now)
        .run()
    }

    return ok({
      content: result.content,
      model: result.model,
      tokensUsed: result.tokensUsed,
      progress: progressLog,
      artifacts: artifacts.map((a) => ({ ...a })),
    })
  }

  // ── POST /api/director/push-inventory ─────────────────────────────────────
  if (path === '/api/director/push-inventory' && method === 'POST') {
    const body = await request.json<{
      address: string
      city?: string
      state?: string
      zip?: string
      price?: number
      description?: string
      type?: string
      mlsNumber?: string
    }>()
    if (!body?.address) return err('Address is required')

    // Create a draft listing in the inventory database.
    // Uses the Inventory Worker's API via service binding is not available here,
    // so we store as a local "director draft" that the front-end can render.
    const listingId = crypto.randomUUID()
    const now = new Date().toISOString()

    await db
      .prepare(
        `INSERT INTO director_drafts (id, user_id, tenant_id, address, city, state, zip, price, description, type, mls_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        listingId,
        session.userId,
        session.tenantId,
        body.address,
        body.city || null,
        body.state || null,
        body.zip || null,
        body.price ?? null,
        body.description || null,
        body.type || 'residential',
        body.mlsNumber || null,
        now,
        now,
      )
      .run()

    return ok({ id: listingId, createdBy: session.userId })
  }

  // ── POST /api/director/requests ───────────────────────────────────────────
  if (path === '/api/director/requests' && method === 'POST') {
    const body = await request.json<{ requestedPack: string; paymentNote?: string }>()
    if (!body?.requestedPack) return err('Requested pack is required')

    const packs: Record<string, number> = {
      '1_slot': 25,
      '5_pack': 100,
      'unlimited': 500,
    }

    const amount = packs[body.requestedPack]
    if (amount === undefined) return err('Invalid requested pack')

    const user = await db
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .bind(session.userId)
      .first<{ id: string; name: string; email: string }>()

    if (!user) return err('User not found', 404)

    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO director_quota_requests (id, user_id, user_name, user_email, requested_pack, amount_usd, payment_note, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .bind(
        id,
        session.userId,
        user.name,
        user.email,
        body.requestedPack,
        amount,
        body.paymentNote || null,
        new Date().toISOString(),
      )
      .run()

    return ok({ id, amountUsd: amount })
  }

  // ── Admin: GET /api/director/admin/dashboard ──────────────────────────────
  if (path === '/api/director/admin/dashboard' && method === 'GET') {
    if (!isAdmin(session)) return err('Forbidden', 403)

    const settings = await getSettings(db)

    // Aggregated telemetry
    const totals = await db
      .prepare(
        `SELECT
           COUNT(*) as total_messages,
           COALESCE(SUM(tokens_used), 0) as total_tokens
         FROM director_messages`
      )
      .first<{ total_messages: number; total_tokens: number }>()

    const { results: users } = await db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role,
                q.project_quota, q.lifetime_created_count, q.is_unlimited, q.total_tokens_used, q.total_spend_usd
         FROM users u
         LEFT JOIN director_user_quotas q ON q.user_id = u.id
         WHERE u.tenant_id = ?`
      )
      .bind(session.tenantId)
      .all()

    const { results: pendingRequests } = await db
      .prepare(
        `SELECT * FROM director_quota_requests
         WHERE status = 'pending'
         ORDER BY created_at ASC`
      )
      .all()

    return ok({
      settings: settings
        ? {
            systemPrompt: settings.system_prompt,
            primaryModel: settings.primary_model,
            fallbackModel: settings.fallback_model,
            monthlyBudgetUsd: settings.monthly_budget_usd,
            defaultUserQuota: settings.default_user_quota,
            hasGeminiKey: !!settings.gemini_api_key,
            hasAnthropicKey: !!settings.anthropic_api_key,
            hasOpenAIKey: !!settings.openai_api_key,
            hasGroqKey: !!settings.groq_api_key,
            hasOpenRouterKey: !!settings.openrouter_api_key,
            hasTavilyKey: !!settings.tavily_api_key,
            enableWebGrounding: settings.enable_web_grounding === 1,
            killSwitchActive: settings.kill_switch_active,
          }
        : null,
      telemetry: {
        totalMessages: totals?.total_messages || 0,
        totalTokens: totals?.total_tokens || 0,
      },
      users: users || [],
      pendingRequests: pendingRequests || [],
    })
  }

  // ── Admin: POST /api/director/admin/requests/:id/:action ─────────────────
  const reqActionMatch = path.match(/^\/api\/director\/admin\/requests\/([^/]+)\/(approve|reject|dismiss)$/)
  if (reqActionMatch && method === 'POST') {
    if (!isAdmin(session)) return err('Forbidden', 403)

    const requestId = reqActionMatch[1]
    const action = reqActionMatch[2]

    const quotaReq = await db
      .prepare('SELECT * FROM director_quota_requests WHERE id = ?')
      .bind(requestId)
      .first<{ id: string; user_id: string; requested_pack: string }>()

    if (!quotaReq) return err('Request not found', 404)

    const resolvedAt = new Date().toISOString()
    await db
      .prepare(
        `UPDATE director_quota_requests SET status = ?, resolved_at = ? WHERE id = ?`
      )
      .bind(action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'dismissed', resolvedAt, requestId)
      .run()

    // If approved, unlock slots
    if (action === 'approve') {
      const pack = quotaReq.requested_pack
      if (pack === '1_slot') {
        await ensureQuotaRecord(db, quotaReq.user_id, defaultQuota(env))
        await db
          .prepare(
            `UPDATE director_user_quotas SET project_quota = project_quota + 1, updated_at = datetime('now') WHERE user_id = ?`
          )
          .bind(quotaReq.user_id)
          .run()
      } else if (pack === '5_pack') {
        await ensureQuotaRecord(db, quotaReq.user_id, defaultQuota(env))
        await db
          .prepare(
            `UPDATE director_user_quotas SET project_quota = project_quota + 5, updated_at = datetime('now') WHERE user_id = ?`
          )
          .bind(quotaReq.user_id)
          .run()
      } else if (pack === 'unlimited') {
        await ensureQuotaRecord(db, quotaReq.user_id, defaultQuota(env))
        await db
          .prepare(
            `UPDATE director_user_quotas SET is_unlimited = 1, updated_at = datetime('now') WHERE user_id = ?`
          )
          .bind(quotaReq.user_id)
          .run()
      }
    }

    return ok({ status: action })
  }

  // ── Admin: POST /api/director/admin/quotas/:userId ────────────────────────
  const quotaAdminMatch = path.match(/^\/api\/director\/admin\/quotas\/([^/]+)$/)
  if (quotaAdminMatch && method === 'POST') {
    if (!isAdmin(session)) return err('Forbidden', 403)

    const userId = quotaAdminMatch[1]
    const body = await request.json<{ action: 'add_slot' | 'add_pack' | 'unlimited' | 'reset' }>()
    const action = body?.action || 'add_slot'

    await ensureQuotaRecord(db, userId, defaultQuota(env))

    switch (action) {
      case 'add_slot':
        await db.prepare(
          `UPDATE director_user_quotas SET project_quota = project_quota + 1, updated_at = datetime('now') WHERE user_id = ?`
        ).bind(userId).run()
        break
      case 'add_pack':
        await db.prepare(
          `UPDATE director_user_quotas SET project_quota = project_quota + 5, updated_at = datetime('now') WHERE user_id = ?`
        ).bind(userId).run()
        break
      case 'unlimited':
        await db.prepare(
          `UPDATE director_user_quotas SET is_unlimited = 1, updated_at = datetime('now') WHERE user_id = ?`
        ).bind(userId).run()
        break
      case 'reset':
        await db.prepare(
          `UPDATE director_user_quotas SET project_quota = ?, is_unlimited = 0, lifetime_created_count = 0, updated_at = datetime('now') WHERE user_id = ?`
        ).bind(defaultQuota(env), userId).run()
        break
    }

    return ok({ success: true })
  }

  // ── Admin: POST /api/director/admin/keys ─────────────────────────────────
  if (path === '/api/director/admin/keys' && method === 'POST') {
    if (!isAdmin(session)) return err('Forbidden', 403)

    const body = await request.json<{
      provider?: string
      apiKey?: string
    }>()
    if (!body?.provider || body.apiKey === undefined) {
      return err('Provider and API key are required')
    }

    const providerMap: Record<string, 'gemini_api_key' | 'anthropic_api_key' | 'openai_api_key' | 'groq_api_key' | 'openrouter_api_key' | 'tavily_api_key'> = {
      gemini: 'gemini_api_key',
      anthropic: 'anthropic_api_key',
      openai: 'openai_api_key',
      groq: 'groq_api_key',
      openrouter: 'openrouter_api_key',
      tavily: 'tavily_api_key',
    }

    const column = providerMap[body.provider]
    if (!column) return err('Invalid provider')

    // Empty string clears the key
    if (!body.apiKey) {
      await db
        .prepare(`UPDATE director_settings SET ${column} = NULL, updated_at = datetime('now') WHERE id = 'global'`)
        .run()
      return ok({ success: true })
    }

    await saveApiKey(db, column, body.apiKey)
    return ok({ success: true })
  }

  // ── Admin: POST /api/director/admin/keys/test ────────────────────────────
  if (path === '/api/director/admin/keys/test' && method === 'POST') {
    if (!isAdmin(session)) return err('Forbidden', 403)

    const body = await request.json<{ provider: string; apiKey?: string }>()
    if (!body?.provider) {
      return err('Provider is required')
    }

    let keyToTest = body.apiKey
    if (!keyToTest) {
      const settings = await getSettings(db)
      if (body.provider === 'gemini') keyToTest = settings.gemini_api_key || undefined
      else if (body.provider === 'anthropic') keyToTest = settings.anthropic_api_key || undefined
      else if (body.provider === 'openai') keyToTest = settings.openai_api_key || undefined
      else if (body.provider === 'groq') keyToTest = settings.groq_api_key || undefined
      else if (body.provider === 'openrouter') keyToTest = settings.openrouter_api_key || undefined
      else if (body.provider === 'tavily') keyToTest = settings.tavily_api_key || undefined
    }

    if (!keyToTest) {
      return err(`No API key found for ${body.provider}. Please enter a key first.`, 400)
    }

    const result = await testProviderKey(body.provider, keyToTest)
    if (!result.ok) {
      return err(result.error || `Connection test failed for ${body.provider}`, 400)
    }

    return ok(result)
  }

  // ── Admin: PUT /api/director/admin/settings ──────────────────────────────
  if (path === '/api/director/admin/settings' && method === 'PUT') {
    if (!isAdmin(session)) return err('Forbidden', 403)

    const body = await request.json<{
      systemPrompt?: string
      primaryModel?: string
      fallbackModel?: string
      monthlyBudgetUsd?: number
      defaultUserQuota?: number
      killSwitchActive?: boolean
      enableWebGrounding?: boolean
    }>()

    await updateSettings(db, {
      system_prompt: body.systemPrompt,
      primary_model: body.primaryModel,
      fallback_model: body.fallbackModel,
      monthly_budget_usd: body.monthlyBudgetUsd,
      default_user_quota: body.defaultUserQuota,
      kill_switch_active: body.killSwitchActive === undefined ? undefined : (body.killSwitchActive ? 1 : 0),
      enable_web_grounding: body.enableWebGrounding === undefined ? undefined : (body.enableWebGrounding ? 1 : 0),
    })

    return ok({ success: true })
  }

  return null
}
