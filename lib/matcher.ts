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
