import { Market } from './types'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

// ── Approach 1: Kalshi's trading API (works with key, fails without) ──────────
async function tryTradingAPI(limit: number): Promise<Market[]> {
  const headers: Record<string, string> = { ...HEADERS, 'Content-Type': 'application/json' }
  if (process.env.KALSHI_API_KEY) {
    headers['Authorization'] = `Token ${process.env.KALSHI_API_KEY}`
  }

  const res = await fetch(
    `https://trading-api.kalshi.com/trade-api/v2/markets?limit=${limit}&status=open`,
    { headers, signal: AbortSignal.timeout(8000), cache: 'no-store' }
  )
  if (!res.ok) throw new Error(`Kalshi API error: ${res.status}`)
  const data = await res.json()
  return parseAPIMarkets(data.markets ?? [])
}

// ── Approach 2: Scrape kalshi.com website (Next.js __NEXT_DATA__) ─────────────
async function tryWebScrape(): Promise<Market[]> {
  // Try multiple pages that might have market data in SSR props
  const pages = [
    'https://kalshi.com/markets',
    'https://kalshi.com',
  ]

  for (const url of pages) {
    try {
      const res = await fetch(url, {
        headers: { ...HEADERS, 'Accept': 'text/html,application/xhtml+xml,*/*' },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      })
      if (!res.ok) continue
      const html = await res.text()

      // Extract Next.js SSR data
      const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (!match) continue

      const nextData = JSON.parse(match[1])

      // Walk the props tree looking for market arrays
      const markets = findMarkets(nextData?.props?.pageProps)
      if (markets.length > 0) {
        console.log(`Kalshi scrape (${url}): found ${markets.length} markets in __NEXT_DATA__`)
        return markets
      }
    } catch {}
  }
  return []
}

// ── Approach 3: Kalshi's internal Next.js API routes ─────────────────────────
async function tryInternalAPI(limit: number): Promise<Market[]> {
  // Next.js apps often expose server-side API routes that proxy their backend
  const endpoints = [
    `https://kalshi.com/api/v2/markets?limit=${limit}&status=open`,
    `https://kalshi.com/api/markets?limit=${limit}`,
    `https://kalshi.com/api/v1/markets?limit=${limit}`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
      })
      if (!res.ok) continue
      const data = await res.json()
      const raw = data.markets ?? data.data?.markets ?? data.result ?? []
      if (Array.isArray(raw) && raw.length > 0) {
        console.log(`Kalshi internal API (${url}): ${raw.length} markets`)
        return parseAPIMarkets(raw)
      }
    } catch {}
  }
  return []
}

// ── Parser for Kalshi trading API market shape ────────────────────────────────
function parseAPIMarkets(raw: any[]): Market[] {
  return raw
    .filter(m => m.status === 'open' || !m.status)
    .map(m => {
      const yesMid = m.yes_bid != null && m.yes_ask != null
        ? ((m.yes_bid + m.yes_ask) / 2) / 100
        : m.last_price != null ? m.last_price / 100
        : 0.5
      const noMid = 1 - yesMid
      if (yesMid <= 0.01 || yesMid >= 0.99) return null
      return {
        id:       `kalshi-${m.ticker ?? m.id ?? Math.random()}`,
        platform: 'kalshi' as const,
        question: m.title ?? m.question ?? m.name ?? 'Unknown',
        yesPrice: yesMid,
        noPrice:  noMid,
        volume:   m.volume ?? m.dollar_volume ?? 0,
        url:      `https://kalshi.com/markets/${m.ticker ?? ''}`,
        endDate:  m.close_time ?? m.end_date,
        liquidity: m.liquidity,
      } as Market
    })
    .filter((m): m is Market => m !== null)
}

// ── Walk a Next.js pageProps object looking for market arrays ─────────────────
function findMarkets(obj: any, depth = 0): Market[] {
  if (!obj || depth > 5) return []
  if (Array.isArray(obj)) {
    // Check if this looks like a market array
    if (obj.length > 0 && obj[0]?.ticker && obj[0]?.yes_bid != null) {
      return parseAPIMarkets(obj)
    }
    for (const item of obj) {
      const found = findMarkets(item, depth + 1)
      if (found.length > 0) return found
    }
  } else if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const found = findMarkets(obj[key], depth + 1)
      if (found.length > 0) return found
    }
  }
  return []
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function fetchKalshiMarkets(limit = 200): Promise<Market[]> {
  // Try each approach in order, return first that works
  try {
    const markets = await tryTradingAPI(limit)
    if (markets.length > 0) {
      console.log(`Kalshi API: ${markets.length} markets`)
      return markets
    }
  } catch (err) {
    console.error('Kalshi fetch error:', String(err).slice(0, 100))
  }

  try {
    const markets = await tryWebScrape()
    if (markets.length > 0) return markets
  } catch {}

  try {
    const markets = await tryInternalAPI(limit)
    if (markets.length > 0) return markets
  } catch {}

  console.log('Kalshi: all approaches failed, 0 markets')
  return []
}
