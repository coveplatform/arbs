import { NextResponse } from 'next/server'
import { fetchManifoldTop, fetchManifoldSearch } from '@/lib/manifold'
import { Market } from '@/lib/types'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const maxDuration = 30

export async function GET() {
  const log: Record<string, unknown> = {}

  const [poolA, poolB] = await Promise.all([
    fetchManifoldTop(50),
    fetchManifoldSearch(),
  ])

  const poolAIds = new Set(poolA.map((m: Market) => m.id.replace('manifold-', '')))
  const uniqueB  = poolB.filter((m: Market) => !poolAIds.has(m.id.replace('manifold-', '')))

  log.poolACount = poolA.length
  log.poolBCount = uniqueB.length
  log.poolASample = poolA.slice(0, 8).map((m: Market) => m.question)
  log.poolBSample = uniqueB.slice(0, 8).map((m: Market) => m.question)

  // Test GPT matching on first 20 of each
  const sliceA = poolA.slice(0, 20)
  const sliceB = uniqueB.slice(0, 20)
  const polyList = sliceA.map((m: Market, i: number) => `P${i}: ${m.question}`).join('\n')
  const secList  = sliceB.map((m: Market, i: number) => `S${i}: ${m.question}`).join('\n')

  const prompt = `Find prediction markets about the SAME real-world topic.

POOL A:
${polyList}

POOL B:
${secList}

Return JSON array: [{"aIndex":0,"bIndex":2,"similarity":0.85,"reason":"both about X"}]
Minimum similarity 0.60. Return [] if none.`

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0,
    })
    log.gptResponse = res.choices[0]?.message?.content
  } catch (e) {
    log.gptError = String(e)
  }

  return NextResponse.json(log)
}
