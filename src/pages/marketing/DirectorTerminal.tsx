import { useEffect, useRef, useState, useCallback } from 'react'
import { Layout } from '@/components/layout/Layout'
import {
  Plus,
  Archive,
  RefreshCw,
  Download,
  Copy,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileText,
  Send,
  Paperclip,
  X,
  Image,
} from 'lucide-react'
import { PaywallModal } from '@/components/director/PaywallModal'
import type {
  DirectorProject,
  DirectorMessage,
  DirectorArtifact,
  DirectorQuota,
  DirectorChatAttachment,
} from '@/types/director'
import { useAuth } from '@/context/AuthContext'

type ChatArtifact = {
  filePath: string
  title: string
  content: string
  fileType: string
}

const ACCEPTED_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.txt', 'image/jpeg', 'image/png', 'image/webp']
const MAX_ATTACHMENTS = 6
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export function DirectorTerminal() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<DirectorProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DirectorMessage[]>([])
  const [artifacts, setArtifacts] = useState<DirectorArtifact[]>([])
  const [liveArtifacts, setLiveArtifacts] = useState<ChatArtifact[]>([])
  const [quota, setQuota] = useState<DirectorQuota>({
    projectQuota: 5,
    lifetimeCreatedCount: 0,
    isUnlimited: false,
    totalTokensUsed: 0,
  })
  const [filter, setFilter] = useState<'active' | 'archived'>('active')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [showPaywall, setShowPaywall] = useState(false)
  const [error, setError] = useState('')
  const [deliverablesOpen, setDeliverablesOpen] = useState(false)
  const [attachments, setAttachments] = useState<DirectorChatAttachment[]>([])
  const [researchProgress, setResearchProgress] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // Load projects on mount
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/director/projects', { credentials: 'include' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load projects')
      setProjects(data.data.projects || [])
      setQuota(data.data.quota)
      // Select first active project if none selected
      if (!activeProjectId) {
        const active = (data.data.projects || []).find((p: DirectorProject) => p.status === 'active')
        if (active) {
          setActiveProjectId(active.id)
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [activeProjectId])

  useEffect(() => { loadProjects() }, [loadProjects])

  // Load project detail when active project changes
  const loadProject = useCallback(async (projectId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/director/projects/${projectId}`, { credentials: 'include' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load project')
      setMessages(data.data.messages || [])
      setArtifacts(data.data.artifacts || [])
      setLiveArtifacts([])
      setResearchProgress([])
      setError('')
    } catch (e: any) {
      setError(e?.message || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeProjectId) {
      loadProject(activeProjectId)
    }
  }, [activeProjectId, loadProject])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [messages, sending])

  async function handleCreateProject() {
    if (!newTitle.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/director/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), propertyAddress: newAddress.trim() || undefined }),
      })
      const data = await res.json()

      if (!data.success) {
        if (res.status === 403 && data.code === 'QUOTA_EXCEEDED') {
          setShowPaywall(true)
        } else {
          setError(data.error || 'Failed to create project')
        }
        return
      }

      setNewTitle('')
      setNewAddress('')
      setShowNewProject(false)
      setActiveProjectId(data.data.id)
      await loadProjects()
    } catch (e: any) {
      setError(e?.message || 'Failed to create project')
    } finally {
      setSending(false)
    }
  }

  async function handleArchive(projectId: string) {
    try {
      const res = await fetch(`/api/director/projects/${projectId}/archive`, {
        method: 'PATCH',
        credentials: 'include',
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to archive project')
      await loadProjects()
    } catch (e: any) {
      setError(e?.message || 'Failed to archive project')
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1] || result
        resolve(base64)
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    const list = Array.from(files)
    for (const file of list) {
      if (attachments.length >= MAX_ATTACHMENTS) {
        setError(`[ERR] Max ${MAX_ATTACHMENTS} attachments per message.`)
        break
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`[ERR] ${file.name} exceeds 5MB upload limit.`)
        continue
      }
      const type = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain')
      void fileToBase64(file).then((b64) => {
        setAttachments((prev) => [...prev, { name: file.name, type, dataBase64: b64 }])
      })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSend() {
    const message = input.trim()
    if ((!message && attachments.length === 0) || !activeProjectId || sending) return

    setSending(true)
    setError('')
    setInput('')
    setResearchProgress([])
    const sentAttachments = attachments
    setAttachments([])

    // Optimistically add operator message
    const tempMsg: DirectorMessage = {
      id: crypto.randomUUID(),
      project_id: activeProjectId,
      user_id: user?.id || '',
      role: 'operator',
      content: message || '[attached ' + sentAttachments.length + ' file(s)]',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMsg])

    try {
      const res = await fetch('/api/director/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          message,
          attachments: sentAttachments,
        }),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to send message')
        return
      }

      setResearchProgress(data.data.progress || [])

      const assistantMsg: DirectorMessage = {
        id: crypto.randomUUID(),
        project_id: activeProjectId,
        user_id: user?.id || '',
        role: 'assistant',
        content: data.data.content,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setLiveArtifacts(data.data.artifacts || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  async function handleQuotaRequest(pack: '1_slot' | '5_pack') {
    const res = await fetch('/api/director/requests', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedPack: pack }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Failed to submit request')
  }

  function handleCopyRemarks() {
    // Find last MLS_ENTRY or the last assistant message
    const assistantMsgs = messages.filter((m) => m.role === 'assistant')
    const last = assistantMsgs[assistantMsgs.length - 1]
    if (!last) return
    // Strip terminal artifacts — copy clean text
    const clean = last.content
      .replace(/^\$.*$/gm, '')
      .replace(/\$\s+.*/g, '')
      .trim()
    navigator.clipboard.writeText(clean)
  }

  const visibleProjects = projects.filter((p) => p.status === filter)
  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <Layout title="DIRECTOR.EXE">
      {/* Header card */}
      <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-card p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-brand-navy flex items-center justify-center text-brand-gold">
              <Terminal className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                DIRECTOR.EXE
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">
                  [STATUS: ONLINE]
                </span>
              </h2>
              <p className="text-sm text-gray-500">Autonomous real estate marketing operating system</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeProject && (
              <span className="text-xs font-mono px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                [Phase: {activeProject.current_phase}]
              </span>
            )}
            <span className="text-xs font-mono px-2 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-200">
              [Quota: {quota.lifetimeCreatedCount}/{quota.isUnlimited ? '\u221E' : quota.projectQuota} Used]
            </span>
            <button
              onClick={loadProjects}
              className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Project list */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-card p-4 space-y-4 h-fit">
          {/* Filter tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setFilter('active')}
              className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-md transition-colors ${filter === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Active
            </button>
            <button
              onClick={() => setFilter('archived')}
              className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-md transition-colors ${filter === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Archived
            </button>
          </div>

          {/* New project button */}
          <button
            onClick={() => setShowNewProject(!showNewProject)}
            className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-brand-navy/40 text-brand-navy hover:bg-brand-navy/5 transition-colors text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>

          {showNewProject && (
            <div className="space-y-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Project title (e.g., 51 Maple St)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Property address (optional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={handleCreateProject}
                disabled={sending || !newTitle.trim()}
                className="w-full px-3 py-2 bg-brand-navy text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {sending ? 'Creating...' : 'Initialize Project'}
              </button>
            </div>
          )}

          {/* Project list */}
          <div className="space-y-1">
            {visibleProjects.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No {filter} projects yet</p>
            ) : (
              visibleProjects.map((project) => (
                <div
                  key={project.id}
                  className={`group p-3 rounded-xl border transition-colors cursor-pointer ${activeProjectId === project.id ? 'border-brand-navy bg-brand-navy/5' : 'border-gray-200 hover:border-gray-300'}`}
                  onClick={() => {
                    setActiveProjectId(project.id)
                    setFilter('active')
                  }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800 truncate">{project.title}</p>
                    <Archive
                      className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleArchive(project.id)
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono mt-1 truncate">{project.current_phase}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main terminal area */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-card p-0 overflow-hidden flex flex-col" style={{ height: '700px' }}>
          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              <span className="text-xs font-mono text-gray-500 ml-2">
                {activeProject ? `${activeProject.title} — operator@director:~$` : 'operator@director:~$'}
              </span>
            </div>
            <button
              onClick={() => setDeliverablesOpen(!deliverablesOpen)}
              className={`text-xs font-semibold px-2 py-1 rounded-lg border transition-colors ${deliverablesOpen ? 'bg-brand-navy text-white border-brand-navy' : 'text-gray-600 border-gray-200 hover:bg-gray-100'}`}
            >
              <span className="flex items-center gap-1">
                {deliverablesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Deliverables ({artifacts.length + liveArtifacts.length})
              </span>
            </button>
          </div>

          {/* Deliverables drawer */}
          {deliverablesOpen && (
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 max-h-40 overflow-y-auto">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Generated Deliverables</p>
              {artifacts.length === 0 && liveArtifacts.length === 0 ? (
                <p className="text-xs text-gray-400">No deliverables yet. Ask DIRECTOR to generate content.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {[...liveArtifacts.map((a) => ({
                    id: `live-${a.title}`,
                    file_path: a.filePath,
                    title: a.title,
                    content: a.content,
                    file_type: a.fileType,
                    live: true,
                  })), ...artifacts.map((a) => ({ ...a, live: false }))]
                    .map((artifact) => (
                      <div key={artifact.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200">
                        <FileText className="h-3.5 w-3.5 text-indigo-500" />
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{artifact.title}</p>
                          <p className="text-[10px] text-gray-400 font-mono truncate max-w-[150px]">{artifact.file_path}</p>
                        </div>
                        <button
                          onClick={() => {
                            const blob = new Blob([artifact.content], { type: 'text/markdown' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `${artifact.title}.md`
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Messages output */}
          <div ref={outputRef} className="flex-1 overflow-y-auto bg-slate-50 p-5 font-mono text-sm leading-relaxed text-gray-900">
            {loading ? (
              <p className="text-gray-400">[..] Loading session...</p>
            ) : messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-gray-500">
DIRECTOR.EXE v2.0
==================
[OK] System online. Autonomous marketing OS active.
[OK] 9 specialist roles loaded (DIRECTOR, MLS_ADMIN, SOCIAL_MGR, COPYWRITER, ADS_SPECIALIST, VIDEO_PRODUCER, STAGING_DIRECTOR, LEAD_NURTURE, MARKET_ANALYST).

[??] Select or create a project to begin. DIRECTOR will self-drive every phase.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={msg.role === 'operator' ? 'text-left' : 'text-left'}>
                    <pre className={`whitespace-pre-wrap font-mono text-sm leading-relaxed px-3 py-2 rounded-lg ${
                      msg.role === 'operator'
                        ? 'bg-white border border-gray-200 text-gray-800 ml-8'
                        : 'bg-white border border-indigo-100 text-gray-900'
                    }`}>
                      {msg.role === 'operator' ? (
                        <><span className="text-brand-navy font-bold">$</span> {msg.content}</>
                      ) : (
                        msg.content
                      )}
                    </pre>
                  </div>
                ))}
                {sending && (
                  <div className="space-y-1">
                    {researchProgress.length > 0 ? (
                      researchProgress.map((line, i) => (
                        <p key={i} className="text-gray-500 whitespace-pre-wrap">{line}</p>
                      ))
                    ) : (
                      <p className="text-gray-400">[..] DIRECTOR is processing...</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 bg-white border-t border-gray-200">
            {!activeProject ? (
              <p className="text-xs text-gray-400 font-mono">[??] Select or create a project to begin.</p>
            ) : (
              <>
                {/* Attachment chips */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                        {att.type.startsWith('image/')
                          ? <Image className="h-3 w-3 text-indigo-500" />
                          : <FileText className="h-3 w-3 text-amber-500" />}
                        <span className="text-xs font-mono text-gray-700 max-w-[140px] truncate">{att.name}</span>
                        <button
                          onClick={() => removeAttachment(i)}
                          className="text-gray-400 hover:text-red-500"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || attachments.length >= MAX_ATTACHMENTS}
                    className="px-3 py-2.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl disabled:opacity-50 flex items-center gap-1.5"
                    title="Attach photo or PDF"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder='Tell DIRECTOR what you need... e.g. "Paste a Zillow link, ask for comps, or upload a room photo"'
                    className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    disabled={sending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || (!input.trim() && attachments.length === 0)}
                    className="px-4 py-2.5 bg-brand-navy text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" /> Send
                  </button>
                  <button
                    onClick={handleCopyRemarks}
                    disabled={messages.length === 0}
                    className="px-3 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                    title="Copy clean remarks (strip terminal formatting)"
                  >
                    <Copy className="h-4 w-4" /> Copy
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Help footer */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-card p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Slash Commands (optional)</p>
        <div className="flex flex-wrap gap-2 text-xs font-mono text-gray-600">
          <span className="px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">/help</span>
          <span className="px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">/role video</span>
          <span className="px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">/status</span>
          <span className="px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">/mls</span>
          <span className="px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">/push</span>
        </div>
      </div>

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        quotaUsed={quota.lifetimeCreatedCount}
        quotaTotal={quota.projectQuota}
        onSubmitRequest={handleQuotaRequest}
      />
    </Layout>
  )
}
