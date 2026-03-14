import { Hono } from 'hono'
import { streamText } from 'ai'
import type { Env, ChatMessage } from '../types'
import { publicAuth } from '../middleware/auth'
import { searchSimilar } from '../lib/vectorize'
import { getLanguageModel } from '../lib/llm'

interface ChatRequestBody {
  messages: ChatMessage[]
}

const chat = new Hono<{ Bindings: Env }>()

chat.post('/', publicAuth, async c => {
  let body: ChatRequestBody
  try {
    body = await c.req.json<ChatRequestBody>()
  } catch {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, 400)
  }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'messages array is required' } }, 400)
  }

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
  const query = lastUserMessage?.content ?? ''
  const topK = parseInt(c.env.PERSONA_TOP_K, 10) || 5
  const temperature = parseFloat(c.env.PERSONA_TEMPERATURE) || 0.7

  // Retrieve relevant context chunks
  let contextChunks: string[] = []
  if (query) {
    try {
      const results = await searchSimilar(c.env.VECTORIZE, c.env.AI, query, topK)
      contextChunks = results.map(r => `[${r.docTitle}]\n${r.text}`)
    } catch (err) {
      console.error('[chat] vectorize search failed, proceeding without context:', err)
    }
  }

  const contextBlock = contextChunks.length > 0
    ? `\n\n## Relevant Knowledge\n\n${contextChunks.join('\n\n---\n\n')}`
    : ''

  const systemPrompt = `${c.env.PERSONA_SYSTEM_PROMPT}${contextBlock}`

  try {
    const model = getLanguageModel(c.env)
    const result = streamText({
      model,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature
    })

    return result.toTextStreamResponse({
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LLM call failed'
    return c.json({ error: { code: 'LLM_ERROR', message } }, 500)
  }
})

export default chat
