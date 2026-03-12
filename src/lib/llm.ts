import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import type { Env } from '../types'

/** Returns a Vercel AI SDK LanguageModel for external providers (openai/anthropic/google). */
export function getExternalLanguageModel(env: Env): LanguageModel {
  const { PERSONA_PROVIDER: provider, PERSONA_MODEL: model } = env

  switch (provider) {
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
    default:
      throw new Error(`Unknown external provider: ${provider}`)
  }
}
