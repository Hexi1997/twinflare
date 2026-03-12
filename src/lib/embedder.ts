const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5'
const BATCH_SIZE = 50 // Workers AI batch limit

export async function embed(ai: Ai, text: string): Promise<number[]> {
  const result = await ai.run(EMBEDDING_MODEL, { text: [text] }) as { data: number[][] }
  const vector = result.data[0]
  if (!vector) throw new Error('Embedding returned no data')
  return vector
}

export async function embedBatch(ai: Ai, texts: string[]): Promise<number[][]> {
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const result = await ai.run(EMBEDDING_MODEL, { text: batch }) as { data: number[][] }
    results.push(...result.data)
  }

  return results
}
