import config from '../../twinflare.config.json'

const EMBEDDING_MODEL = (config as any).embedding?.model

export async function embed(ai: Ai, text: string): Promise<number[]> {
  const result = await ai.run(EMBEDDING_MODEL, { text: [text] }) as { data: number[][] }
  const vector = result.data[0]
  if (!vector) throw new Error('Embedding returned no data')
  return vector
}