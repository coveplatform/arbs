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
    const data = await res.json()
    return Array.isArray(data) ? data : []
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
  // Top-volume markets (global breadth)
  const topFetch = tryFetch(`${BASE}&limit=200`)

  // US-politics keyword searches — targeting topics PredictIt covers
  const keywords = [
    'trump', 'senate', 'speaker', 'congress', 'pardon',
    'netanyahu', 'israel', 'cabinet', 'impeach', 'federal reserve',
    'house seat', 'democrat', 'republican', 'election 2026',
  ]
  const keywordFetches = keywords.map(kw =>
    tryFetch(`${BASE}&limit=50&search=${encodeURIComponent(kw)}`)
  )

  const [topData, ...kwResults] = await Promise.all([topFetch, ...keywordFetches])

  const seen = new Set<string>()
  const markets: Market[] = []

  for (const batch of [topData, ...kwResults]) {
    for (const m of batch) {
      if (!m.active || m.closed || seen.has(m.id)) continue
      seen.add(m.id)
      const market = toMarket(m)
      if (market) markets.push(market)
    }
  }

  // Sort by volume — highest-volume markets go first into GPT batches
  markets.sort((a, b) => b.volume - a.volume)

  const kwTotal = kwResults.reduce((n, r) => n + r.length, 0)
  console.log(`Polymarket: ${topData.length} top-vol + ${kwTotal} keyword = ${markets.length} unique`)
  return markets
}
