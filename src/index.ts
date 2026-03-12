import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'
import chatRoute from './routes/chat'
import searchRoute from './routes/search'
import personaRoute from './routes/persona'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({ origin: '*' }))

// Health check
app.get('/', c => c.json({ name: c.env.PERSONA_NAME, status: 'ok' }))

// Public API endpoints (authenticated by PUBLIC_API_TOKEN)
app.route('/api/chat', chatRoute)
app.route('/api/search', searchRoute)
app.route('/api/persona', personaRoute)

app.notFound(c => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500)
})

export default app
