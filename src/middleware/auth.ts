import type { Context, Next } from 'hono'
import type { Env } from '../types'

function extractBearer(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice(7).trim() || null
}

export async function publicAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const token = extractBearer(c.req.raw)
  if (!token || token !== c.env.PUBLIC_API_TOKEN) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API token' } }, 401)
  }
  await next()
}
