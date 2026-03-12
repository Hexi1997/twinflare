import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createWorkersAI } from 'workers-ai-provider'
import type { LanguageModel } from 'ai'
import type { Env } from '../types'

/** Returns a Vercel AI SDK LanguageModel for any provider. */
export function getLanguageModel(env: Env): LanguageModel {
  const { PERSONA_PROVIDER: provider, PERSONA_MODEL: model } = env

  switch (provider) {
    case 'cloudflare': {
      const workersai = createWorkersAI({ binding: env.AI })
      return workersai(model as Parameters<typeof workersai>[0]) as unknown as LanguageModel
    }
    case 'openai': {
      if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
      const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
      return openai(model)
    }
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
      const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
      return anthropic(model)
    }
    case 'google': {
      if (!env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is not set')
      const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })
      return google(model)
    }
    case 'openrouter': {
      if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')
      const openrouter = createOpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      })
      return openrouter(model)
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
