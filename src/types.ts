export type LLMProvider = 'cloudflare' | 'openai' | 'anthropic' | 'google'

export interface Env {
  // Cloudflare bindings
  AI: Ai
  VECTORIZE: VectorizeIndex

  // Auth secrets
  SYNC_SECRET: string
  PUBLIC_API_TOKEN: string

  // Persona vars (populated by CI from twinflare.config.json)
  PERSONA_NAME: string
  PERSONA_SYSTEM_PROMPT: string
  PERSONA_PROVIDER: LLMProvider
  PERSONA_MODEL: string
  PERSONA_TOP_K: string
  PERSONA_TEMPERATURE: string

  // LLM provider API keys (optional, set via wrangler secret)
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  GOOGLE_API_KEY?: string
}

export interface Chunk {
  text: string
  title: string
  index: number
}

export interface SearchResult {
  text: string
  docTitle: string
  filePath: string
  score: number
}

export interface SyncFile {
  path: string
  content: string
}

export interface SyncRequestBody {
  files?: SyncFile[]
  deleted?: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}
