#!/usr/bin/env node
/**
 * Sync changed Markdown files in docs/ to the TwinFlare Worker.
 * Called by GitHub Actions after deploy.
 *
 * Usage:
 *   node scripts/sync.js
 *
 * Required env vars:
 *   WORKER_URL       — deployed Worker URL (e.g. https://twinflare.your-name.workers.dev)
 *   SYNC_SECRET      — must match Worker's SYNC_SECRET
 *
 * Optional env vars:
 *   FORCE_FULL_SYNC  — set to "true" to re-index all docs regardless of git diff
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const WORKER_URL = process.env.WORKER_URL?.replace(/\/$/, '')
const SYNC_SECRET = process.env.SYNC_SECRET
const FORCE_FULL_SYNC = process.env.FORCE_FULL_SYNC === 'true'
const DOCS_DIR = 'docs'

if (!WORKER_URL) {
  console.error('ERROR: WORKER_URL environment variable is required')
  process.exit(1)
}
if (!SYNC_SECRET) {
  console.error('ERROR: SYNC_SECRET environment variable is required')
  process.exit(1)
}

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
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
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
  // Check if HEAD~1 exists (not first commit)
  const parentExists = run('git rev-parse --verify HEAD~1 2>/dev/null')
  if (!parentExists) {
    console.log('First commit detected — performing full sync')
    return { upserted: getAllDocs(), deleted: [] }
  }

  const diffOutput = run(`git diff --name-status HEAD~1 HEAD -- ${DOCS_DIR}/`)
  if (!diffOutput) {
    console.log('No changes in docs/ detected')
    return { upserted: [], deleted: [] }
  }

  const upserted = []
  const deleted = []

  for (const line of diffOutput.split('\n')) {
    const [status, ...parts] = line.split('\t')
    const filePath = parts[parts.length - 1]
    if (!filePath || !filePath.endsWith('.md')) continue

    if (status === 'D') {
      deleted.push(filePath)
    } else {
      // A (added), M (modified), R (renamed) — treat as upsert
      upserted.push(filePath)
    }
  }

  return { upserted, deleted }
}

async function main() {
  const { upserted, deleted } = FORCE_FULL_SYNC
    ? { upserted: getAllDocs(), deleted: [] }
    : getChangedFiles()

  if (upserted.length === 0 && deleted.length === 0) {
    console.log('Nothing to sync.')
    return
  }

  console.log(`Syncing ${upserted.length} upserted, ${deleted.length} deleted files…`)

  const files = upserted.map(filePath => {
    const content = fs.readFileSync(filePath, 'utf8')
    return { path: filePath, content }
  })

  const payload = { files, deleted }

  const response = await fetch(`${WORKER_URL}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SYNC_SECRET}`,
    },
    body: JSON.stringify(payload),
  })

  const result = await response.json()

  if (!response.ok) {
    console.error('Sync failed:', JSON.stringify(result, null, 2))
    process.exit(1)
  }

  console.log('Sync complete:', JSON.stringify(result, null, 2))
  if (result.errors?.length) {
    console.warn('Some files had errors:', result.errors)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
