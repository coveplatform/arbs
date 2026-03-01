import { Market } from './types'

const API = 'https://api.manifold.markets/v0'

interface ManifoldMarket {
  id: string
  question: string
  probability: number
  volume: number
  url: string
  closeTime?: number
  isResolved: boolean
  outcomeType: string
  totalLiquidity?: number
}

function toMarket(m: ManifoldMarket): Market {
  return {
    id:        `manifold-${m.id}`,
    platform:  'manifold' as const,
    question:  m.question,
    yesPrice:  m.probability,
    noPrice:   1 - m.probability,
    volume:    m.volume || 0,
    url:       m.url,
    endDate:   m.closeTime ? new Date(m.closeTime).toISOString() : undefined,
    liquidity: m.totalLiquidity,
  }
}

function isValid(m: ManifoldMarket): boolean {
  return !m.isResolved && m.outcomeType === 'BINARY' && m.probability > 0
}

// Fetch the top binary markets by liquidity (most comparable to real-money markets)
export async function fetchManifoldTop(limit = 300): Promise<Market[]> {
  try {
    const res = await fetch(
      `${API}/markets?limit=${limit}&sort=liquidity&filter=open&contractType=BINARY`,
      { cache: 'no-store', signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return []
    const data: ManifoldMarket[] = await res.json()
    return (Array.isArray(data) ? data : [])
      .filter(isValid)
      .map(toMarket)
      .filter(m => m.yesPrice > 0.02 && m.yesPrice < 0.98)
  } catch { return [] }
}

async function search(term: string, limit = 20): Promise<ManifoldMarket[]> {
  try {
    const res = await fetch(
      `${API}/search-markets?term=${encodeURIComponent(term)}&limit=${limit}&sort=score`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

// Wide set of search terms to cover all platform categories
const SEARCH_TERMS = [
  // US Politics
  'trump impeach', 'trump resign', 'trump conviction', 'trump second term',
  'house midterm 2026', 'senate midterm 2026', '2026 election',
  'republican president 2028', 'democratic nominee 2028',
  'supreme court', 'congress pass', 'filibuster',

  // US Economy / Fed
  'federal reserve rate cut', 'interest rate 2025', 'interest rate 2026',
  'fed rate hike', 'inflation', 'us recession', 'gdp growth',
  'unemployment rate', 'stock market crash', 'federal reserve chair',

  // World Leaders / Elections
  'macron resign', 'keir starmer', 'uk prime minister',
  'uk election', 'french election 2027', 'german election',
  'uk conservative leader', 'reform uk nigel farage',
  'putin resign', 'zelensky', 'canada election 2025', 'canada election 2026',

  // Geopolitics
  'ukraine russia ceasefire', 'ukraine war end',
  'taiwan invasion china', 'north korea',
  'iran nuclear deal', 'nato expansion',
  'israel ceasefire', 'middle east war',

  // Tech / AI
  'openai', 'gpt-5', 'ai regulation', 'ai act',
  'bitcoin price', 'crypto regulation', 'sec crypto',
  'elon musk tesla', 'spacex starship', 'doge government',

  // Global / Misc
  'who pandemic', 'climate agreement', 'un security council',
]

export async function fetchManifoldSearch(): Promise<Market[]> {
  const seen  = new Set<string>()
  const all: Market[] = []

  const results = await Promise.all(SEARCH_TERMS.map(t => search(t, 15)))
  for (const batch of results) {
    for (const m of batch) {
      if (!seen.has(m.id) && isValid(m)) {
        seen.add(m.id)
        const market = toMarket(m)
        if (market.yesPrice > 0.02 && market.yesPrice < 0.98) all.push(market)
      }
    }
  }
  return all
}

// Broad search terms — 12 parallel calls, ~2s total, covers all major market categories
const BROAD_TERMS = [
  'trump', 'election 2026', 'president',
  'russia ukraine', 'china taiwan',
  'federal reserve rate', 'recession',
  'bitcoin', 'ai regulation',
  'uk prime minister', 'macron', 'modi',
]

// Combined: top-by-liquidity (single fast call) + broad keyword search (12 parallel)
export async function fetchManifoldMarkets(): Promise<Market[]> {
  const [top, ...searched] = await Promise.all([
    fetchManifoldTop(200),
    ...BROAD_TERMS.map(t => search(t, 20)),
  ])
  const seen = new Set<string>()
  const all: Market[] = []
  for (const m of top) {
    if (!seen.has(m.id)) { seen.add(m.id); all.push(m) }
  }
  for (const batch of searched) {
    for (const m of batch) {
      if (!seen.has(m.id) && isValid(m)) {
        seen.add(m.id)
        const market = toMarket(m)
        if (market.yesPrice > 0.02 && market.yesPrice < 0.98) all.push(market)
      }
    }
  }
  return all
}
