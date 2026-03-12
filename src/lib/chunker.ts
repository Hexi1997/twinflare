import type { Chunk } from '../types'

const MAX_CHUNK_CHARS = 1800 // ~450 tokens
const MIN_CHUNK_CHARS = 100

/**
 * Splits a Markdown document into semantically meaningful chunks.
 * Strategy: split by H1/H2 headings first; if a section is still too large,
 * split further by paragraphs (blank lines).
 */
export function chunkMarkdown(content: string, filePath: string): Chunk[] {
  const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') ?? filePath
  const chunks: Chunk[] = []

  // Extract document title from first H1, fallback to filename
  const h1Match = content.match(/^#\s+(.+)$/m)
  const docTitle = h1Match?.[1]?.trim() ?? fileName

  // Split by H1 and H2 headings, keeping the heading with its content
  const sections = splitBySections(content)

  for (const section of sections) {
    const title = extractHeading(section) ?? docTitle
    const text = section.trim()
    if (text.length < MIN_CHUNK_CHARS) continue

    if (text.length <= MAX_CHUNK_CHARS) {
      chunks.push({ text, title, index: chunks.length })
    } else {
      // Section too large: split by paragraphs
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

function splitBySections(content: string): string[] {
  // Split at lines starting with # or ##
  const parts = content.split(/(?=^#{1,2}\s)/m)
  return parts.filter(p => p.trim().length > 0)
}

function splitByParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).filter(p => p.trim().length > 0)
}

function extractHeading(text: string): string | null {
  const match = text.match(/^#{1,2}\s+(.+)$/m)
  return match?.[1]?.trim() ?? null
}
