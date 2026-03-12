import type { Chunk, SearchResult } from '../types'
import { embed, embedBatch } from './embedder'

/**
 * ID scheme (no KV needed):
 *   manifest vector : "m::{encodedPath}"           — stores chunkCount in metadata
 *   chunk vectors   : "c::{encodedPath}::{index}"  — stores chunk text + title
 */

function encodePath(filePath: string): string {
  return encodeURIComponent(filePath)
}

function manifestId(filePath: string): string {
  return `m::${encodePath(filePath)}`
}

function chunkId(filePath: string, index: number): string {
  return `c::${encodePath(filePath)}::${index}`
}

/** Insert or replace all vectors for a file. */
export async function upsertFile(
  vectorize: VectorizeIndex,
  ai: Ai,
  filePath: string,
  chunks: Chunk[],
  docTitle: string,
): Promise<void> {
  // Remove existing vectors for this file first (idempotent)
  await deleteFile(vectorize, filePath)

  if (chunks.length === 0) return

  const texts = chunks.map(c => c.text)
  const embeddings = await embedBatch(ai, texts)

  const vectors: VectorizeVector[] = chunks.map((chunk, i) => ({
    id: chunkId(filePath, i),
    values: embeddings[i] ?? [],
    metadata: {
      type: 'chunk',
      filePath,
      chunkIndex: i,
      docTitle,
      text: chunk.text,
      title: chunk.title,
    },
  }))

  // Manifest: a zero-vector used solely for metadata storage
  const manifest: VectorizeVector = {
    id: manifestId(filePath),
    values: new Array(768).fill(0) as number[],
    metadata: {
      type: 'manifest',
      filePath,
      chunkCount: chunks.length,
      docTitle,
    },
  }

  await vectorize.upsert([manifest, ...vectors])
}

const MAX_CHUNKS_PER_FILE = 500

/** Remove all vectors (manifest + chunks) for a file. */
export async function deleteFile(vectorize: VectorizeIndex, filePath: string): Promise<void> {
  const ids = [
    manifestId(filePath),
    ...Array.from({ length: MAX_CHUNKS_PER_FILE }, (_, i) => chunkId(filePath, i)),
  ]
  await vectorize.deleteByIds(ids)
}

/** Semantic search: embed the query and return top-K matching chunks. */
export async function searchSimilar(
  vectorize: VectorizeIndex,
  ai: Ai,
  query: string,
  topK: number,
): Promise<SearchResult[]> {
  const queryVector = await embed(ai, query)

  const result = await vectorize.query(queryVector, {
    topK,
    filter: { type: 'chunk' },
    returnMetadata: 'all',
    returnValues: false,
  })

  return result.matches.map(match => ({
    text: (match.metadata?.text as string | undefined) ?? '',
    docTitle: (match.metadata?.docTitle as string | undefined) ?? '',
    filePath: (match.metadata?.filePath as string | undefined) ?? '',
    score: match.score,
  }))
}
