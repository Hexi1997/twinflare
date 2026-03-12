import { Hono } from 'hono'
import type { Env, SyncRequestBody } from '../types'
import { syncAuth } from '../middleware/auth'
import { chunkMarkdown } from '../lib/chunker'
import { upsertFile, deleteFile } from '../lib/vectorize'

const sync = new Hono<{ Bindings: Env }>()

sync.post('/', syncAuth, async c => {
  let body: SyncRequestBody
  try {
    body = await c.req.json<SyncRequestBody>()
  } catch {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, 400)
  }

  const { files = [], deleted = [] } = body
  let processedCount = 0
  let deletedCount = 0
  let totalChunks = 0
  const errors: string[] = []

  // Handle deleted files
  for (const filePath of deleted) {
    try {
      await deleteFile(c.env.VECTORIZE, filePath)
      deletedCount++
    } catch (err) {
      errors.push(`Delete ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Handle upserted files
  for (const file of files) {
    try {
      const chunks = chunkMarkdown(file.content, file.path)
      const docTitle = chunks[0]?.title ?? file.path.split('/').pop()?.replace(/\.md$/, '') ?? file.path
      await upsertFile(c.env.VECTORIZE, c.env.AI, file.path, chunks, docTitle)
      processedCount++
      totalChunks += chunks.length
    } catch (err) {
      errors.push(`Upsert ${file.path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return c.json({
    ok: errors.length === 0,
    processed: processedCount,
    deleted: deletedCount,
    totalChunks,
    errors: errors.length > 0 ? errors : undefined,
  })
})

export default sync
