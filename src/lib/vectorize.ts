import type { SearchResult } from '../types'
import { embed } from './embedder'

/**
 * ID scheme (no KV needed):
 *   manifest vector : "m::{encodedPath}"           — stores chunkCount in metadata
 *   chunk vectors   : "c::{encodedPath}::{index}"  — stores chunk text + title
 */
/** Semantic search: embed the query and return top-K matching chunks. */
export async function searchSimilar(
  vectorize: VectorizeIndex,
  ai: Ai,
  query: string,
  topK: number,
): Promise<SearchResult[]> {
  const queryVector = await embed(ai, query)

  // Request more results to account for manifest vectors being filtered out client-side.
  // Vectorize v2 metadata filtering requires a pre-configured metadata index; to avoid
  // that infra dependency (and silent failures when the index is missing), we filter here.
  const result = await vectorize.query(queryVector, {
    topK: topK + 10,
    returnMetadata: 'all',
    returnValues: false,
  })

  return result.matches
    .filter(match => match.metadata?.type === 'chunk')
    .slice(0, topK)
    .map(match => ({
      text: (match.metadata?.text as string | undefined) ?? '',
      docTitle: (match.metadata?.docTitle as string | undefined) ?? '',
      filePath: (match.metadata?.filePath as string | undefined) ?? '',
      score: match.score,
    }))
}
