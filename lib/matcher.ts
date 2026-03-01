import OpenAI from 'openai'
import { Market, MarketPair } from './types'
import { calculateArb } from './arb-calculator'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SPORTS_PATTERNS = [
  /\bvs\.\b/i, /map \d/i, /starcraft/i, /o\/u \d\.?\d*/i,
  /both teams to score/i, /handicap/i, /match winner/i,
  /set \d winner/i, /game \d winner/i, /temperature in/i,
  /win the.*premier league/i, /win the.*champions league/i,
  /win the.*bundesliga/i, /win the.*serie a/i, /win the.*la liga/i,
  /\bnba\b/i, /\bnfl\b/i, /\bmlb\b/i, /\bnhl\b/i,
  /\bworld cup\b/i, /\bsuper bowl\b/i, /\bchampionship\b.*game/i,
]

function isNonSports(market: Market): boolean {
  return !SPORTS_PATTERNS.some(p => p.test(market.question))
}

// Compare a slice of A against a slice of B, returning matched pairs
export async function matchBatch(
  aSlice: Market[],
  bSlice: Market[],
): Promise<Array<{ aIndex: number; bIndex: number; similarity: number; reason: string }>> {
  if (!aSlice.length || !bSlice.length) return []

  const aList = aSlice.map((m, i) => `A${i}: ${m.question}`).join('\n')
  const bList = bSlice.map((m, i) => `B${i}: ${m.question}`).join('\n')

  const prompt = `Find prediction market pairs asking about the EXACT SAME real-world outcome.

POOL A (${aSlice[0].platform}):
${aList}

POOL B (${bSlice[0].platform}):
${bList}

Rules:
- Match ONLY if both markets resolve based on the same specific event AND same person/entity AND same direction.
- "Will Trump be impeached?" matches "Will the House impeach Trump?" — same event.
- "Will Trump serve his full term?" does NOT match "Will China invade Taiwan?" — different events.
- "Will Macron resign before 2027?" matches "Will Macron leave office early?" — same outcome.
- Same topic / same year is NOT enough — must be same specific outcome.
- Minimum similarity: 0.75

Return JSON array only (no markdown):
[{"aIndex":0,"bIndex":2,"similarity":0.85,"reason":"both resolve on Trump impeachment by House"}]

Return [] if no genuine matches.`

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0,
    })
    const text = res.choices[0]?.message?.content ?? '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  } catch {
    return []
  }
}

// Match two market pools against each other using a grid of GPT batches
export async function matchMarkets(
  marketsA: Market[],
  marketsB: Market[]
): Promise<MarketPair[]> {
  const filteredA = marketsA.filter(isNonSports)
  const filteredB = marketsB.filter(isNonSports)
  if (!filteredA.length || !filteredB.length) return []

  const BATCH = 50  // markets per slice — smaller = more focused matches

  // Build a grid of (aSlice, bSlice) pairs, capped at 4 total GPT calls
  const aChunks: Market[][] = []
  for (let i = 0; i < Math.min(filteredA.length, BATCH * 2); i += BATCH) {
    aChunks.push(filteredA.slice(i, i + BATCH))
  }
  const bChunks: Market[][] = []
  for (let j = 0; j < Math.min(filteredB.length, BATCH * 2); j += BATCH) {
    bChunks.push(filteredB.slice(j, j + BATCH))
  }

  const batches: Array<{ a: Market[]; b: Market[] }> = []
  for (const a of aChunks) {
    for (const b of bChunks) {
      batches.push({ a, b })
      if (batches.length >= 4) break  // cap at 4 GPT calls per pair
    }
    if (batches.length >= 4) break
  }

  const batchResults = await Promise.all(
    batches.map(({ a, b }) => matchBatch(a, b))
  )

  const seen = new Set<string>()
  const pairs: MarketPair[] = []

  batchResults.forEach((matches, idx) => {
    const { a, b } = batches[idx]
    matches
      .filter(m => m.aIndex < a.length && m.bIndex < b.length)
      .forEach(m => {
        const marketA = a[m.aIndex]
        const marketB = b[m.bIndex]
        const key = `${marketA.id}-${marketB.id}`
        if (seen.has(key)) return
        seen.add(key)
        pairs.push({
          id: key,
          marketA,
          marketB,
          similarity: m.similarity,
          arbOpportunity: calculateArb(marketA, marketB),
        })
      })
  })

  return pairs.sort((a, b) => {
    const aP = a.arbOpportunity?.profitPercent ?? -1
    const bP = b.arbOpportunity?.profitPercent ?? -1
    return bP - aP
  })
}
