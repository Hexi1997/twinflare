import { Hono } from 'hono'
import type { Env } from '../types'

const persona = new Hono<{ Bindings: Env }>()

persona.get('/', c => {
  return c.json({
    name: c.env.PERSONA_NAME,
    provider: c.env.PERSONA_PROVIDER,
    model: c.env.PERSONA_MODEL,
  })
})

export default persona
