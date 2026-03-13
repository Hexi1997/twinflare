#!/usr/bin/env node
/**
 * Sync changed Markdown files in docs/ directly to Cloudflare Vectorize via REST API.
 * Called by GitHub Actions after deploy.
 *
 * Usage:
 *   node scripts/sync.js
 *
 * Required env vars:
 *   CLOUDFLARE_ACCOUNT_ID  — Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN   — Cloudflare API token (needs AI and Vectorize write permissions)
 *
 * Optional env vars:
 *   VECTORIZE_INDEX_NAME   — Vectorize index name (default: twinflare-index)
 *   FORCE_FULL_SYNC        — set to "true" to re-index all docs regardless of git diff
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const INDEX_NAME = process.env.VECTORIZE_INDEX_NAME || 'twinflare-index'
const FORCE_FULL_SYNC = process.env.FORCE_FULL_SYNC === 'true'
const DOCS_DIR = 'docs'

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
const EMBEDDING_BATCH_SIZE = 50
const CF_API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`

if (!ACCOUNT_ID) {
  console.error('ERROR: CLOUDFLARE_ACCOUNT_ID environment variable is required')
  process.exit(1)
}
if (!API_TOKEN) {
  console.error('ERROR: CLOUDFLARE_API_TOKEN environment variable is required')
  process.exit(1)
}

// ── Chunker (mirrors src/lib/chunker.ts) ────────────────────────────────────

const MAX_CHUNK_CHARS = 1800
const MIN_CHUNK_CHARS = 100

function chunkMarkdown(content, filePath) {
  const fileName = path.basename(filePath, '.md')
  const chunks = []
  const h1Match = content.match(/^#\s+(.+)$/m)
  const docTitle = h1Match?.[1]?.trim() ?? fileName

  for (const section of splitBySections(content)) {
    const title = extractHeading(section) ?? docTitle
    const text = section.trim()
    if (text.length < MIN_CHUNK_CHARS) continue

    if (text.length <= MAX_CHUNK_CHARS) {
      chunks.push({ text, title, index: chunks.length })
    } else {
      const paragraphs = splitByParagraphs(text)
      let buffer = ''
      for (const para of paragraphs) {
        if ((buffer + '\n\n' + para).length > MAX_CHUNK_CHARS && buffer.length >= MIN_CHUNK_CHARS) {
          chunks.push({ text: buffer.trim(), title, index: chunks.length })
          buffer = para
        } else {
          buffer = buffer ? buffer + '\n\n' + para : para
        }
      }
      if (buffer.trim().length >= MIN_CHUNK_CHARS) {
        chunks.push({ text: buffer.trim(), title, index: chunks.length })
      }
    }
  }

  return chunks
}

function splitBySections(content) {
  return content.split(/(?=^#{1,2}\s)/m).filter(p => p.trim().length > 0)
}

function splitByParagraphs(text) {
  return text.split(/\n{2,}/).filter(p => p.trim().length > 0)
}

function extractHeading(text) {
  const match = text.match(/^#{1,2}\s+(.+)$/m)
  return match?.[1]?.trim() ?? null
}

// ── Vector ID scheme (mirrors src/lib/vectorize.ts) ─────────────────────────

function manifestId(filePath) {
  return `m::${encodeURIComponent(filePath)}`
}

function chunkId(filePath, index) {
  return `c::${encodeURIComponent(filePath)}::${index}`
}

// ── Cloudflare API helpers ───────────────────────────────────────────────────

async function cfFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      ...options.headers,
    },
  })

  const text = await res.text()

  if (!res.ok) {
    let detail = text.slice(0, 300)
    try {
      const err = JSON.parse(text)
      detail = JSON.stringify(err.errors ?? err)
    } catch {}
    throw new Error(`CF API ${res.status} at ${url}: ${detail}`)
  }

  // Some CF endpoints (e.g. Vectorize v2 upsert) return NDJSON or a non-standard
  // JSON body; parse the first non-empty line to stay robust.
  let data
  try {
    data = JSON.parse(text)
  } catch {
    const firstLine = text.split('\n').find(l => l.trim())
    if (!firstLine) throw new Error(`CF API returned empty body at ${url}`)
    try {
      data = JSON.parse(firstLine)
    } catch {
      throw new Error(`CF API returned non-JSON at ${url}: ${text.slice(0, 200)}`)
    }
  }

  // Standard CF API wrapper uses { success, errors }; Vectorize v2 upsert uses { mutationId }
  if ('success' in data && !data.success) {
    throw new Error(`CF API error at ${url}: ${JSON.stringify(data.errors)}`)
  }

  return data
}

async function embedBatch(texts) {
  const embeddings = []
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)
    const data = await cfFetch(`${CF_API}/ai/run/${EMBEDDING_MODEL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: batch }),
    })
    embeddings.push(...data.result.data)
  }
  return embeddings
}

// ── Vectorize operations ─────────────────────────────────────────────────────

const VECTORIZE_BASE = `${CF_API}/vectorize/v2/indexes/${INDEX_NAME}`

// Vectorize v2 REST API has no get-by-ids endpoint; delete the manifest + a safe
// range of chunk IDs (delete-by-ids is idempotent for non-existent IDs).
const MAX_CHUNKS_PER_FILE = 500

const DELETE_BATCH_SIZE = 100

async function deleteVectorsForFile(filePath) {
  const ids = [
    manifestId(filePath),
    ...Array.from({ length: MAX_CHUNKS_PER_FILE }, (_, i) => chunkId(filePath, i)),
  ]
  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    const batch = ids.slice(i, i + DELETE_BATCH_SIZE)
    await cfFetch(`${VECTORIZE_BASE}/delete_by_ids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch }),
    })
  }
}

async function upsertFileVectors(filePath, content) {
  const chunks = chunkMarkdown(content, filePath)

  // Always delete first for idempotent upsert
  await deleteVectorsForFile(filePath).catch(console.error)

  if (chunks.length === 0) return 0

  const embeddings = await embedBatch(chunks.map(c => c.text))
  const docTitle = chunks[0]?.title ?? path.basename(filePath, '.md')

  const vectors = chunks.map((chunk, i) => ({
    id: chunkId(filePath, i),
    values: embeddings[i],
    metadata: {
      type: 'chunk',
      filePath,
      chunkIndex: i,
      docTitle,
      text: chunk.text,
      title: chunk.title,
    },
  }))

  const manifest = {
    id: manifestId(filePath),
    values: new Array(768).fill(0),
    metadata: { type: 'manifest', filePath, chunkCount: chunks.length, docTitle },
  }

  const ndjson = [manifest, ...vectors].map(v => JSON.stringify(v)).join('\n')
  await cfFetch(`${VECTORIZE_BASE}/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body: ndjson,
  })

  return chunks.length
}

// ── File discovery ───────────────────────────────────────────────────────────

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function getAllDocs() {
  const allFiles = []
  function walk(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry)
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath)
      } else if (entry.endsWith('.md')) {
        allFiles.push(fullPath.replace(/\\/g, '/'))
      }
    }
  }
  walk(DOCS_DIR)
  return allFiles
}

function getChangedFiles() {
  const parentExists = run('git rev-parse --verify HEAD~1 2>/dev/null')
  if (!parentExists) {
    console.log('First commit detected — performing full sync')
    return { upserted: getAllDocs(), deleted: [] }
  }

  const diffOutput = run(`git diff --name-status HEAD~1 HEAD -- ${DOCS_DIR}/`)
  if (!diffOutput) {
    return { upserted: [], deleted: [] }
  }

  const upserted = []
  const deleted = []

  for (const line of diffOutput.split('\n')) {
    const [status, ...parts] = line.split('\t')
    const filePath = parts[parts.length - 1]
    if (!filePath?.endsWith('.md')) continue
    if (status === 'D') {
      deleted.push(filePath)
    } else {
      upserted.push(filePath)
    }
  }

  return { upserted, deleted }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { upserted, deleted } = FORCE_FULL_SYNC
    ? { upserted: getAllDocs(), deleted: [] }
    : getChangedFiles()

  if (upserted.length === 0 && deleted.length === 0) {
    console.log('Nothing to sync.')
    return
  }

  console.log(`Syncing ${upserted.length} upserted, ${deleted.length} deleted files…`)

  const errors = []
  let totalChunks = 0
  let processedCount = 0
  let deletedCount = 0

  for (const filePath of deleted) {
    try {
      await deleteVectorsForFile(filePath).catch(console.error)
      deletedCount++
      console.log(`  ✓ deleted ${filePath}`)
    } catch (err) {
      errors.push(`Delete ${filePath}: ${err.message}`)
      console.error(`  ✗ delete ${filePath}: ${err.message}`)
    }
  }

  for (const filePath of upserted) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const chunkCount = await upsertFileVectors(filePath, content)
      processedCount++
      totalChunks += chunkCount
      console.log(`  ✓ upserted ${filePath} (${chunkCount} chunks)`)
    } catch (err) {
      errors.push(`Upsert ${filePath}: ${err.message}`)
      console.error(`  ✗ upsert ${filePath}: ${err.message}`)
    }
  }

  console.log(`\nSync complete: ${processedCount} upserted, ${deletedCount} deleted, ${totalChunks} total chunks`)

  if (errors.length > 0) {
    console.error('Errors:', errors)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
