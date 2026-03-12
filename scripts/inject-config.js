#!/usr/bin/env node
/**
 * Reads twinflare.config.json and injects persona values into wrangler.toml [vars].
 * Called by GitHub Actions before `wrangler deploy`.
 *
 * Usage:
 *   node scripts/inject-config.js
 */

const fs = require('fs')

const CONFIG_FILE = 'twinflare.config.json'
const WRANGLER_FILE = 'wrangler.toml'

if (!fs.existsSync(CONFIG_FILE)) {
  console.error(`ERROR: ${CONFIG_FILE} not found`)
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
const persona = config.persona ?? {}

const required = ['name', 'systemPrompt', 'provider', 'model']
for (const key of required) {
  if (!persona[key]) {
    console.error(`ERROR: persona.${key} is required in ${CONFIG_FILE}`)
    process.exit(1)
  }
}

const newVars = `[vars]
PERSONA_NAME = ${JSON.stringify(persona.name)}
PERSONA_SYSTEM_PROMPT = ${JSON.stringify(persona.systemPrompt)}
PERSONA_PROVIDER = ${JSON.stringify(persona.provider)}
PERSONA_MODEL = ${JSON.stringify(persona.model)}
PERSONA_TOP_K = ${JSON.stringify(String(persona.topK ?? 5))}
PERSONA_TEMPERATURE = ${JSON.stringify(String(persona.temperature ?? 0.7))}`

let toml = fs.readFileSync(WRANGLER_FILE, 'utf8')

// Replace existing [vars] block (everything from [vars] to EOF)
toml = toml.replace(/\n*\[vars\][\s\S]*$/, '')
toml = toml.trimEnd() + '\n\n' + newVars + '\n'

fs.writeFileSync(WRANGLER_FILE, toml)
console.log('Injected persona config into wrangler.toml')
