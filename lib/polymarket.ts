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
  tags?: Array<{ id: number; slug: string; label: string }>
}

async function tryFetch(url: string): Promise<PolymarketRaw[]> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ArbScanner/1.0)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
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
    id:       `poly-${m.id}`,
    platform: 'polymarket' as const,
    question: m.question,
    yesPrice,
    noPrice,
    volume:   parseFloat(m.volume) || 0,
    url:      `https://polymarket.com/event/${m.id}`,
    endDate:  m.endDate,
    liquidity: parseFloat(m.liquidity || '0'),
  }
}

export async function fetchPolymarkets(): Promise<Market[]> {
  // Fetch top-volume markets AND politics-tagged markets in parallel
  const [topData, polData] = await Promise.all([
    tryFetch(`${BASE}&limit=200`).catch(() => [] as PolymarketRaw[]),
    tryFetch(`${BASE}&limit=100&tag_slug=politics`).catch(() => [] as PolymarketRaw[]),
  ])

  const combined = [...topData, ...polData]
  if (!combined.length) {
    console.error('All Polymarket endpoints failed')
    return []
  }

  // Deduplicate by id, convert to Market, filter invalid
  const seen = new Set<string>()
  const markets: Market[] = []
  for (const m of combined) {
    if (!m.active || m.closed) continue
    if (seen.has(m.id)) continue
    seen.add(m.id)
    const market = toMarket(m)
    if (market) markets.push(market)
  }

  console.log(`Polymarket: ${topData.length} top-vol + ${polData.length} politics = ${markets.length} unique`)
  return markets
}
