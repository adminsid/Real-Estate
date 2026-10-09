// DIRECTOR.EXE Marketing OS — Types

export interface DirectorChatAttachment {
  name: string
  type: string
  dataBase64: string
}

export interface DirectorProject {
  id: string
  user_id: string
  tenant_id: string
  title: string
  property_address?: string | null
  current_phase: string
  status: 'active' | 'archived' | 'converted'
  state_summary?: string | null
  created_at: string
  updated_at: string
}

export interface DirectorMessage {
  id: string
  project_id: string
  user_id: string
  role: 'operator' | 'assistant'
  speaker_tag?: string | null
  content: string
  tokens_used?: number
  created_at: string
}

export interface DirectorArtifact {
  id: string
  project_id: string
  file_path: string
  title: string
  content: string
  file_type: string
  r2_key?: string | null
  created_at: string
}

export interface DirectorQuota {
  projectQuota: number
  lifetimeCreatedCount: number
  isUnlimited: boolean
  totalTokensUsed: number
}

export interface DirectorQuotaRequest {
  id: string
  user_id: string
  user_name: string
  user_email: string
  requested_pack: '1_slot' | '5_pack' | 'unlimited'
  amount_usd: number
  payment_note?: string | null
  status: 'pending' | 'approved' | 'rejected' | 'dismissed'
  created_at: string
  resolved_at?: string | null
}

export interface ProjectListResponse {
  projects: DirectorProject[]
  quota: DirectorQuota
}

export interface ProjectDetailResponse {
  project: DirectorProject
  messages: DirectorMessage[]
  artifacts: DirectorArtifact[]
}

export interface ChatResponse {
  content: string
  model: string
  tokensUsed: number
  progress: string[]
  artifacts: {
    filePath: string
    title: string
    content: string
    fileType: string
  }[]
}

export interface AdminDashboardData {
  settings: {
    systemPrompt: string
    primaryModel: string
    fallbackModel: string
    monthlyBudgetUsd: number
    defaultUserQuota: number
    hasGeminiKey: boolean
    hasAnthropicKey: boolean
    hasOpenAIKey: boolean
    hasGroqKey?: boolean
    hasOpenRouterKey?: boolean
    hasTavilyKey: boolean
    enableWebGrounding: boolean
    killSwitchActive: number
  } | null
  telemetry: {
    totalMessages: number
    totalTokens: number
  }
  users: Array<{
    id: string
    name: string
    email: string
    role: string
    project_quota: number | null
    lifetime_created_count: number | null
    is_unlimited: number | null
    total_tokens_used: number | null
    total_spend_usd: number | null
  }>
  pendingRequests: DirectorQuotaRequest[]
}
