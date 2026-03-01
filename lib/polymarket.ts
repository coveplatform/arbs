import { Market } from './types'

const BASE = 'https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume&ascending=false'

interface PolymarketRaw {
  id: string
  question: string
  outcomePrices: string
  outcomes: string
  volume: string
  endDate: string
  active: boolean
  closed: boolean
  liquidity?: string
}

async function tryFetch(url: string): Promise<PolymarketRaw[]> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArbScanner/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

function toMarket(m: PolymarketRaw): Market | null {
  let yesPrice = 0.5, noPrice = 0.5
  try {
    const prices = JSON.parse(m.outcomePrices)
    yesPrice = parseFloat(prices[0]) || 0.5
    noPrice  = parseFloat(prices[1]) || (1 - yesPrice)
  } catch {}
  if (yesPrice <= 0.01 || yesPrice >= 0.99) return null
  if (m.endDate && new Date(m.endDate) <= new Date()) return null
  return {
    id:        `poly-${m.id}`,
    platform:  'polymarket' as const,
    question:  m.question,
    yesPrice,
    noPrice,
    volume:    parseFloat(m.volume) || 0,
    url:       `https://polymarket.com/event/${m.id}`,
    endDate:   m.endDate,
    liquidity: parseFloat(m.liquidity || '0'),
  }
}

export async function fetchPolymarkets(): Promise<Market[]> {
  // Fetch top-volume + multiple category tags in parallel
  const tagSlugs = ['politics', 'trump', 'us-elections', 'economics', 'science', 'elections', 'congress', 'world']
  const fetches = [
    tryFetch(`${BASE}&limit=200`),
    ...tagSlugs.map(tag => tryFetch(`${BASE}&limit=100&tag_slug=${tag}`)),
  ]

  const results = await Promise.all(fetches)
  const [topData, ...tagResults] = results
  const totalTagged = tagResults.reduce((n, r) => n + r.length, 0)

  const seen = new Set<string>()
  const markets: Market[] = []

  for (const batch of [topData, ...tagResults]) {
    for (const m of batch) {
      if (!m.active || m.closed || seen.has(m.id)) continue
      seen.add(m.id)
      const market = toMarket(m)
      if (market) markets.push(market)
    }
  }

  // Sort by volume so highest-confidence markets go first into GPT batches
  markets.sort((a, b) => b.volume - a.volume)

  console.log(`Polymarket: ${topData.length} top-vol + ${totalTagged} tagged = ${markets.length} unique`)
  return markets
}
