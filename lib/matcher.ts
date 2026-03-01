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

  const prompt = `You are matching prediction markets from two platforms to find pairs that cover the same underlying real-world event or question.

POOL A (${aSlice[0].platform}):
${aList}

POOL B (${bSlice[0].platform}):
${bList}

RULES:
1. Match if both markets resolve on the same underlying real-world event — wording, phrasing, and timeframes CAN differ.
2. Different timeframes are OK if the question is about the same ongoing situation (e.g., "through March 2026" vs "through June 2026" for the same person's job status).
3. Be generous — if you think there's a 60%+ chance these refer to the same event, include the match.

EXAMPLES of valid matches (include these):
- "Will Netanyahu remain PM?" ↔ "Will Netanyahu remain Israeli prime minister through March 2026?" → MATCH (same person, same job)
- "Will Mike Johnson remain Speaker?" ↔ "Will Mike Johnson remain Speaker of the House through the 119th Congress?" → MATCH
- "Republicans control Senate after 2026?" ↔ "Will the GOP hold the Senate majority?" → MATCH
- "Will the Fed cut rates in Q1?" ↔ "Federal Reserve rate cut by March?" → MATCH
- "Will Trump serve a full second term?" ↔ "Donald Trump to serve as president for 9+ years by end of 2030" → MATCH
- "Will Macron leave office early?" ↔ "Will President of France be the first to leave office?" → MATCH (if A is about France)
- "Will Mojtaba Khamenei be next Supreme Leader?" ↔ "Will Mojtaba Khamenei be next Supreme Leader of Iran?" → MATCH

NOT matches (exclude these):
- "Will Trump be impeached?" ↔ "Will Republicans win in 2026?" (different outcomes)
- Two markets about the same topic asking about different specific people

Minimum confidence: 0.60. When uncertain, INCLUDE the match.

Return ONLY a JSON array with no markdown fences:
[{"aIndex":0,"bIndex":2,"similarity":0.82,"reason":"same person same job Netanyahu"}]

If truly no matches exist, return: []`

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

  // 4 GPT calls per comparison pair covering the full 2×2 grid:
  // A[0:50]×B[0:50], A[0:50]×B[50:100], A[50:100]×B[0:50], A[50:100]×B[50:100]
  const batches: Array<{ a: Market[]; b: Market[] }> = [
    { a: filteredA.slice(0, BATCH),         b: filteredB.slice(0, BATCH) },
    { a: filteredA.slice(0, BATCH),         b: filteredB.slice(BATCH, BATCH * 2) },
    { a: filteredA.slice(BATCH, BATCH * 2), b: filteredB.slice(0, BATCH) },
    { a: filteredA.slice(BATCH, BATCH * 2), b: filteredB.slice(BATCH, BATCH * 2) },
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
