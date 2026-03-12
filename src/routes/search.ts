import { Hono } from 'hono'
import type { Env } from '../types'
import { publicAuth } from '../middleware/auth'
import { searchSimilar } from '../lib/vectorize'

interface SearchRequestBody {
  query: string
  topK?: number
}

const search = new Hono<{ Bindings: Env }>()

search.post('/', publicAuth, async c => {
  let body: SearchRequestBody
  try {
    body = await c.req.json<SearchRequestBody>()
  } catch {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, 400)
  }

  const { query, topK } = body
  if (!query || typeof query !== 'string') {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'query string is required' } }, 400)
  }

  const defaultK = parseInt(c.env.PERSONA_TOP_K, 10) || 5
  const k = Math.min(topK ?? defaultK, 20)

  try {
    const results = await searchSimilar(c.env.VECTORIZE, c.env.AI, query, k)
    return c.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return c.json({ error: { code: 'SEARCH_ERROR', message } }, 500)
  }
})

export default search
