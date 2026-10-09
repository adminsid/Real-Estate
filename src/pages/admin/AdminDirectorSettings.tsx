import { useEffect, useState, useCallback } from 'react'
import { Layout } from '@/components/layout/Layout'
import {
  Activity,
  Key,
  RefreshCw,
  Power,
  DollarSign,
  Users,
  Cpu,
  ShieldAlert,
  Search,
} from 'lucide-react'
import type { AdminDashboardData } from '@/types/director'

export function AdminDirectorSettings() {
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  // Key vault state
  const [geminiKey, setGeminiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openAIKey, setOpenAIKey] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [openRouterKey, setOpenRouterKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [probeResult, setProbeResult] = useState<Record<string, { ok: boolean; latencyMs: number }>>({})

  // Prompt & settings
  const [systemPrompt, setSystemPrompt] = useState('')
  const [primaryModel, setPrimaryModel] = useState('')
  const [fallbackModel, setFallbackModel] = useState('')
  const [monthlyBudget, setMonthlyBudget] = useState(15)
  const [defaultQuota, setDefaultQuota] = useState(5)
  const [killSwitch, setKillSwitch] = useState(false)
  const [webGrounding, setWebGrounding] = useState(true)

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/director/admin/dashboard', { credentials: 'include' })
      const response = await res.json()
      if (!response.success) {
        throw new Error(response.error || 'Failed to load dashboard')
      }
      const d = response.data as AdminDashboardData
      setData(d)
      setSystemPrompt(d.settings?.systemPrompt || '')
      setPrimaryModel(d.settings?.primaryModel || 'groq:llama-3.3-70b-versatile')
      setFallbackModel(d.settings?.fallbackModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast')
      setMonthlyBudget(d.settings?.monthlyBudgetUsd ?? 15)
      setDefaultQuota(d.settings?.defaultUserQuota ?? 5)
      setKillSwitch((d.settings?.killSwitchActive ?? 0) === 1)
      setWebGrounding(d.settings?.enableWebGrounding ?? true)
      setError('')
    } catch (e: any) {
      setError(e?.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  async function handleSaveSettings() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/director/admin/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          primaryModel,
          fallbackModel,
          monthlyBudgetUsd: Number(monthlyBudget),
          defaultUserQuota: Number(defaultQuota),
          killSwitchActive: killSwitch,
          enableWebGrounding: webGrounding,
        }),
      })
      const response = await res.json()
      if (!response.success) throw new Error(response.error || 'Failed to save settings')
    } catch (e: any) {
      setError(e?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveKey(provider: 'gemini' | 'anthropic' | 'openai' | 'groq' | 'openrouter' | 'tavily') {
    setSaving(true)
    setError('')
    try {
      const keyMap = {
        gemini: geminiKey,
        anthropic: anthropicKey,
        openai: openAIKey,
        groq: groqKey,
        openrouter: openRouterKey,
        tavily: tavilyKey,
      }
      const res = await fetch('/api/director/admin/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: keyMap[provider] }),
      })
      const response = await res.json()
      if (!response.success) throw new Error(response.error || 'Failed to save key')
      await loadDashboard()
    } catch (e: any) {
      setError(e?.message || 'Failed to save key')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestKey(provider: 'gemini' | 'anthropic' | 'openai' | 'groq' | 'openrouter' | 'tavily') {
    setTestingProvider(provider)
    setError('')
    try {
      const keyMap = {
        gemini: geminiKey,
        anthropic: anthropicKey,
        openai: openAIKey,
        groq: groqKey,
        openrouter: openRouterKey,
        tavily: tavilyKey,
      }
      const res = await fetch('/api/director/admin/keys/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: keyMap[provider] }),
      })
      const response = await res.json()
      if (response.success) {
        setProbeResult((prev) => ({ ...prev, [provider]: { ok: true, latencyMs: response.data.latencyMs } }))
      } else {
        setProbeResult((prev) => ({ ...prev, [provider]: { ok: false, latencyMs: 0 } }))
        setError(response.error || 'Connection test failed')
      }
    } catch (e: any) {
      setProbeResult((prev) => ({ ...prev, [provider]: { ok: false, latencyMs: 0 } }))
      setError(e?.message || 'Connection test failed')
    } finally {
      setTestingProvider(null)
    }
  }

  async function handleRequestAction(id: string, action: 'approve' | 'reject' | 'dismiss') {
    try {
      const res = await fetch(`/api/director/admin/requests/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
      })
      const response = await res.json()
      if (!response.success) throw new Error(response.error || 'Action failed')
      await loadDashboard()
    } catch (e: any) {
      setError(e?.message || 'Action failed')
    }
  }

  async function handleQuotaAction(userId: string, action: 'add_slot' | 'add_pack' | 'unlimited' | 'reset') {
    try {
      const res = await fetch(`/api/director/admin/quotas/${userId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const response = await res.json()
      if (!response.success) throw new Error(response.error || 'Quota action failed')
      await loadDashboard()
    } catch (e: any) {
      setError(e?.message || 'Quota action failed')
    }
  }

  if (loading) {
    return (
      <Layout title="DIRECTOR.EXE Admin">
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading DIRECTOR control center...
        </div>
      </Layout>
    )
  }

  const filteredUsers = (data?.users || []).filter((u) => {
    const q = search.toLowerCase()
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  const totalSpend = (data?.users || []).reduce((acc, u) => acc + (u.total_spend_usd || 0), 0)

  return (
    <Layout title="DIRECTOR.EXE Admin">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">{error}</div>
      )}

      {/* Telemetry ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-card">
          <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <Activity className="h-3.5 w-3.5" /> Total Messages
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{data?.telemetry?.totalMessages || 0}</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-card">
          <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <Cpu className="h-3.5 w-3.5" /> Tokens Used
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{(data?.telemetry?.totalTokens || 0).toLocaleString()}</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-card">
          <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <DollarSign className="h-3.5 w-3.5" /> Monthly Spend
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <p className="text-2xl font-extrabold text-gray-900">${totalSpend.toFixed(2)}</p>
            <span className="text-xs text-gray-400">/ ${monthlyBudget.toFixed(2)}</span>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-card">
          <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <Users className="h-3.5 w-3.5" /> Agents
          </div>
          <p className="text-2xl font-extrabold text-gray-900 mt-2">{filteredUsers.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Key Vault */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Key className="h-4 w-4 text-gray-500" />
            <h3 className="font-bold text-gray-900 text-sm">Secure API Key Vault</h3>
          </div>

          <div className="space-y-4">
            {[
              { id: 'groq', label: 'Groq API (Free Tier — 14,400 req/day — Llama 3.3 70B & DeepSeek R1)', hasKey: data?.settings?.hasGroqKey },
              { id: 'openrouter', label: 'OpenRouter API (Free :free Models & Multi-Provider)', hasKey: data?.settings?.hasOpenRouterKey },
              { id: 'gemini', label: 'Google Gemini 2.0 Flash', hasKey: data?.settings?.hasGeminiKey },
              { id: 'tavily', label: 'Tavily Search API (Autonomous Web Research)', hasKey: data?.settings?.hasTavilyKey },
              { id: 'anthropic', label: 'Claude 3.5 Sonnet (Fallback)', hasKey: data?.settings?.hasAnthropicKey },
              { id: 'openai', label: 'GPT-4o (Fallback)', hasKey: data?.settings?.hasOpenAIKey },
            ].map((provider) => (
              <div key={provider.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">{provider.label}</label>
                  <span className={`text-[10px] font-mono font-bold ${provider.hasKey ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {provider.hasKey ? '[STATUS: ACTIVE (STORED)]' : '[STATUS: NOT SET]'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={
                      provider.id === 'groq' ? groqKey :
                      provider.id === 'openrouter' ? openRouterKey :
                      provider.id === 'gemini' ? geminiKey :
                      provider.id === 'tavily' ? tavilyKey :
                      provider.id === 'anthropic' ? anthropicKey : openAIKey
                    }
                    onChange={(e) => {
                      if (provider.id === 'groq') setGroqKey(e.target.value)
                      else if (provider.id === 'openrouter') setOpenRouterKey(e.target.value)
                      else if (provider.id === 'gemini') setGeminiKey(e.target.value)
                      else if (provider.id === 'tavily') setTavilyKey(e.target.value)
                      else if (provider.id === 'anthropic') setAnthropicKey(e.target.value)
                      else setOpenAIKey(e.target.value)
                    }}
                    placeholder={provider.hasKey ? '•••••••••••••••• (Stored in Database Vault)' : 'Paste API key here...'}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  />
                  <button
                    onClick={async () => {
                      await handleSaveKey(provider.id as any)
                      if (provider.id === 'groq') setGroqKey('')
                      else if (provider.id === 'openrouter') setOpenRouterKey('')
                      else if (provider.id === 'gemini') setGeminiKey('')
                      else if (provider.id === 'tavily') setTavilyKey('')
                      else if (provider.id === 'anthropic') setAnthropicKey('')
                      else setOpenAIKey('')
                    }}
                    disabled={
                      saving ||
                      (provider.id === 'groq' ? !groqKey :
                       provider.id === 'openrouter' ? !openRouterKey :
                       provider.id === 'gemini' ? !geminiKey :
                       provider.id === 'tavily' ? !tavilyKey :
                       provider.id === 'anthropic' ? !anthropicKey : !openAIKey)
                    }
                    className="px-3 py-2 bg-brand-navy text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => handleTestKey(provider.id as any)}
                    disabled={
                      testingProvider !== null ||
                      (!provider.hasKey && (
                        provider.id === 'groq' ? !groqKey :
                        provider.id === 'openrouter' ? !openRouterKey :
                        provider.id === 'gemini' ? !geminiKey :
                        provider.id === 'tavily' ? !tavilyKey :
                        provider.id === 'anthropic' ? !anthropicKey : !openAIKey
                      ))
                    }
                    className="px-3 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testingProvider === provider.id ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
                {probeResult[provider.id] && (
                  <p className={`text-[10px] font-mono font-bold ${probeResult[provider.id].ok ? 'text-emerald-600' : 'text-red-600'}`}>
                    {probeResult[provider.id].ok
                      ? `[VERIFIED] Connection OK — Latency ${probeResult[provider.id].latencyMs}ms`
                      : '[ERR] Connection failed'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pending Requests */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5">
          <h3 className="font-bold text-gray-900 text-sm mb-4">Quota Unlock Requests</h3>
          {(data?.pendingRequests || []).length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No pending unlock requests</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(data?.pendingRequests || []).map((req) => (
                <div key={req.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{req.user_name}</p>
                    <p className="text-xs text-gray-500">
                      {req.requested_pack === '1_slot' ? '1 Slot' : req.requested_pack === '5_pack' ? '5 Pack' : 'Unlimited'} — ${req.amount_usd}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleRequestAction(req.id, 'approve')}
                      className="px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:opacity-90"
                    >
                      Approve & Unlock
                    </button>
                    <button
                      onClick={() => handleRequestAction(req.id, 'reject')}
                      className="px-2.5 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:opacity-90"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleRequestAction(req.id, 'dismiss')}
                      className="px-2.5 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent Quota Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm">Agent Quota Management</h3>
          <div className="relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] text-gray-500 uppercase tracking-wider">
                <th className="pb-2 pr-4 font-bold">Agent</th>
                <th className="pb-2 pr-4 font-bold">Quota</th>
                <th className="pb-2 pr-4 font-bold">Lifetime</th>
                <th className="pb-2 pr-4 font-bold">Tokens</th>
                <th className="pb-2 pr-4 font-bold">Spend</th>
                <th className="pb-2 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">
                    <p className="font-semibold text-gray-800">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${u.is_unlimited ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                      {u.is_unlimited ? 'UNLIMITED' : u.project_quota ?? '—'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600">{u.lifetime_created_count ?? 0}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{(u.total_tokens_used ?? 0).toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-gray-600">${(u.total_spend_usd ?? 0).toFixed(2)}</td>
                  <td className="py-2.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleQuotaAction(u.id, 'add_slot')}
                        className="px-2 py-1 text-[10px] font-bold border border-gray-200 rounded hover:bg-gray-50"
                        title="+1 Slot"
                      >
                        +1 Slot
                      </button>
                      <button
                        onClick={() => handleQuotaAction(u.id, 'add_pack')}
                        className="px-2 py-1 text-[10px] font-bold border border-gray-200 rounded hover:bg-gray-50"
                        title="+5 Pack"
                      >
                        +5
                      </button>
                      <button
                        onClick={() => handleQuotaAction(u.id, 'unlimited')}
                        className="px-2 py-1 text-[10px] font-bold border border-purple-200 text-purple-600 rounded hover:bg-purple-50"
                        title="Set Unlimited"
                      >
                        <ShieldAlert className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Prompt & Guardrails */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm">DIRECTOR.EXE Master Prompt & Guardrails</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer" title="Allow DIRECTOR to run live Google/Tavily searches for comps, market data, schools & tax records">
              <input
                type="checkbox"
                checked={webGrounding}
                onChange={(e) => setWebGrounding(e.target.checked)}
                className="rounded"
              />
              <Search className="h-3.5 w-3.5 text-indigo-500" /> Enable Web Grounding
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={killSwitch}
                onChange={(e) => setKillSwitch(e.target.checked)}
                className="rounded"
              />
              <Power className="h-3.5 w-3.5 text-red-500" /> Kill Switch
            </label>
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-4 py-2 bg-brand-navy text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Primary Model</label>
            <select
              value={primaryModel}
              onChange={(e) => setPrimaryModel(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="groq:llama-3.3-70b-versatile">Groq: Llama 3.3 70B (Free — Ultra Fast — Recommended)</option>
              <option value="groq:deepseek-r1-distill-llama-70b">Groq: DeepSeek R1 70B (Free — Deep Reasoning)</option>
              <option value="groq:llama-3.1-8b-instant">Groq: Llama 3.1 8B (Free — Instant)</option>
              <option value="openrouter:meta-llama/llama-3.3-70b-instruct:free">OpenRouter: Llama 3.3 70B (Free :free)</option>
              <option value="@cf/meta/llama-3.3-70b-instruct-fp8-fast">Cloudflare: Llama 3.3 70B (Free Native)</option>
              <option value="@cf/deepseek-ai/deepseek-r1-distill-qwen-32b">Cloudflare: DeepSeek R1 32B (Free Reasoning)</option>
              <option value="gemini-2.0-flash">Google: Gemini 2.0 Flash</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Fallback Model</label>
            <select
              value={fallbackModel}
              onChange={(e) => setFallbackModel(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="@cf/meta/llama-3.3-70b-instruct-fp8-fast">Cloudflare: Llama 3.3 70B (Native Fallback)</option>
              <option value="claude-3-5-sonnet-20241022">Anthropic: Claude 3.5 Sonnet (Paid Fallback)</option>
              <option value="gpt-4o">OpenAI: GPT-4o (Paid Fallback)</option>
              <option value="gemini-2.0-flash">Google: Gemini 2.0 Flash (Fallback)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Monthly Budget (USD)</label>
              <input
                type="number"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Default Quota</label>
              <input
                type="number"
                value={defaultQuota}
                onChange={(e) => setDefaultQuota(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={14}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy"
        />
      </div>
    </Layout>
  )
}
