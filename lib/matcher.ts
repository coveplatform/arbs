import OpenAI from 'openai'
import { Market, MarketPair } from './types'
import { calculateArb } from './arb-calculator'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const EXCLUDE_PATTERNS = [
  // Sports
  /\bvs\.\b/i, /map \d/i, /starcraft/i, /o\/u \d\.?\d*/i,
  /both teams to score/i, /handicap/i, /match winner/i,
  /set \d winner/i, /game \d winner/i, /temperature in/i,
  /win the.*premier league/i, /win the.*champions league/i,
  /win the.*bundesliga/i, /win the.*serie a/i, /win the.*la liga/i,
  /\bnba\b/i, /\bnfl\b/i, /\bmlb\b/i, /\bnhl\b/i,
  /\bworld cup\b/i, /\bsuper bowl\b/i, /\bchampionship\b.*game/i,
  /\bfc\b.*win/i, /win on \d{4}-\d{2}-\d{2}/i, /spread:/i, /\(-\d+\.?\d*\)/i,
  /\bgoals?\b.*match/i, /\bover\/under\b/i,
  // Crypto / price speculation (high-volume on Polymarket but unmatchable elsewhere)
  /\b(bitcoin|ethereum|solana|dogecoin|cardano|ripple)\b/i,
  /\b(btc|eth|sol|doge|xrp|bnb|ada|avax|matic|link)\b/i,
  /will.*price (reach|hit|exceed|cross|drop|fall|go)/i,
  /\$\d[\d,.]*[km]?\s*(by|before|end|in \d)/i,
]

function isMatchable(market: Market): boolean {
  return !EXCLUDE_PATTERNS.some(p => p.test(market.question))
}

// Compare a slice of A against a slice of B, returning matched pairs
export async function matchBatch(
  aSlice: Market[],
  bSlice: Market[],
): Promise<Array<{ aIndex: number; bIndex: number; similarity: number; reason: string }>> {
  if (!aSlice.length || !bSlice.length) return []

  const aList = aSlice.map((m, i) => `A${i}: ${m.question}`).join('\n')
  const bList = bSlice.map((m, i) => `B${i}: ${m.question}`).join('\n')

  console.log(`matchBatch A[0..4]: ${aSlice.slice(0,5).map(m=>m.question).join(' | ')}`)
  console.log(`matchBatch B[0..4]: ${bSlice.slice(0,5).map(m=>m.question).join(' | ')}`)

  const prompt = `You are matching prediction markets from two platforms to find pairs covering the same real-world event.

POOL A (${aSlice[0].platform}):
${aList}

POOL B (${bSlice[0].platform}):
${bList}

Match pairs where both markets will resolve YES or NO based on essentially the same real-world outcome.
Wording can differ — what matters is the underlying event.

Good matches (include these):
- "Will Republicans control the Senate after 2026?" ↔ "Will the GOP hold the Senate majority?" (same outcome)
- "Will the Fed cut rates in Q1?" ↔ "Federal Reserve rate cut by March?" (same event)
- "Will Trump sign the tax bill?" ↔ "Tax Cut Act passed in 2025?" (same outcome)
- "Will Macron resign before 2027?" ↔ "Will Macron leave office early?" (same outcome)

Not a match (exclude these):
- "Will Trump be impeached?" ↔ "Will Republicans win in 2026?" (different outcomes)
- Two markets about the same topic but different specific outcomes

Minimum confidence: 0.70. When in doubt, include the match.

Return ONLY a JSON array, no markdown:
[{"aIndex":0,"bIndex":2,"similarity":0.82,"reason":"both resolve on same Fed rate decision"}]

If no matches exist, return: []`

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0,
    })
    const text = res.choices[0]?.message?.content ?? '[]'
    console.log(`matchBatch(${aSlice[0]?.platform}×${bSlice[0]?.platform}): GPT raw → ${text.slice(0, 200)}`)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('matchBatch OpenAI error:', String(err).slice(0, 200))
    return []
  }
}

// Match two market pools against each other using a grid of GPT batches
export async function matchMarkets(
  marketsA: Market[],
  marketsB: Market[]
): Promise<MarketPair[]> {
  const filteredA = marketsA.filter(isMatchable)
  const filteredB = marketsB.filter(isMatchable)
  if (!filteredA.length || !filteredB.length) return []

  console.log(`matchMarkets: ${filteredA[0]?.platform}(${filteredA.length}) × ${filteredB[0]?.platform}(${filteredB.length})`)

  const BATCH = 50  // markets per slice

  // 3 GPT calls per comparison pair covering A[0:50]×B[0:50], A[0:50]×B[50:100], A[50:100]×B[0:50]
  const batches: Array<{ a: Market[]; b: Market[] }> = [
    { a: filteredA.slice(0, BATCH),        b: filteredB.slice(0, BATCH) },
    { a: filteredA.slice(0, BATCH),        b: filteredB.slice(BATCH, BATCH * 2) },
    { a: filteredA.slice(BATCH, BATCH * 2), b: filteredB.slice(0, BATCH) },
  ].filter(({ a, b }) => a.length > 0 && b.length > 0)

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
