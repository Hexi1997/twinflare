import type { SearchResult } from '../types'
import { embed } from './embedder'

/**
 * ID scheme (no KV needed):
 *   manifest vector : "m::{encodedPath}"           — stores chunkCount in metadata
 *   chunk vectors   : "c::{encodedPath}::{index}"  — stores chunk text + title
 */
/** Semantic search: embed the query, fetch candidates, rerank, and return top-K chunks. */
export async function searchSimilar(
  vectorize: VectorizeIndex,
  ai: Ai,
  query: string,
  topK: number,
): Promise<SearchResult[]> {
  const queryVector = await embed(ai, query)

  // Fetch a larger candidate pool for reranking.
  // The extra buffer accounts for manifest vectors filtered client-side (see ID scheme above).
  const candidateK = topK * 2
  const result = await vectorize.query(queryVector, {
    topK: candidateK + 10,
    returnMetadata: 'all',
    returnValues: false,
  })

  const candidates = result.matches
    .filter(match => match.metadata?.type === 'chunk')
    .slice(0, candidateK)

  if (candidates.length === 0) return []

  // Cross-encoder reranking for higher relevance precision.
  const reranked = await ai.run('@cf/baai/bge-reranker-base', {
    query,
    contexts: candidates.map(c => ({ text: (c.metadata?.text as string | undefined) ?? '' })),
    top_k: topK,
  })

  return (reranked.response ?? [])
    .filter(item => item.id !== undefined && candidates[item.id!] !== undefined)
    .map(item => {
      const chunk = candidates[item.id!]!
      return {
        text: (chunk.metadata?.text as string | undefined) ?? '',
        docTitle: (chunk.metadata?.docTitle as string | undefined) ?? '',
        filePath: (chunk.metadata?.filePath as string | undefined) ?? '',
        score: item.score ?? 0,
      }
    })
}
