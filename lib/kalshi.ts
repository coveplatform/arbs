import { Market } from './types'

// Kalshi's PUBLIC read-only API — no authentication required
// Despite the "elections" subdomain, this covers ALL Kalshi markets
const KALSHI_PUBLIC = 'https://api.elections.kalshi.com/trade-api/v2'

export async function fetchKalshiMarkets(limit = 200): Promise<Market[]> {
  try {
    // Fetch open markets — public endpoint, no auth needed
    const res = await fetch(
      `${KALSHI_PUBLIC}/markets?status=open&limit=${limit}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ArbScanner/1.0)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      }
    )

    if (!res.ok) throw new Error(`Kalshi public API error: ${res.status}`)
    const data = await res.json()

    const markets = (data.markets ?? [])
      .filter((m: any) => m.status === 'open')
      .map((m: any) => {
        // Prices in cents (0-100), convert to probability (0-1)
        const yesMid = m.yes_ask != null && m.yes_bid != null
          ? ((m.yes_bid + m.yes_ask) / 2) / 100
          : m.last_price != null ? m.last_price / 100
          : 0.5
        const noMid = 1 - yesMid
        if (yesMid <= 0.01 || yesMid >= 0.99) return null
        return {
          id:        `kalshi-${m.ticker}`,
          platform:  'kalshi' as const,
          question:  m.title,
          yesPrice:  yesMid,
          noPrice:   noMid,
          volume:    m.volume ?? 0,
          url:       `https://kalshi.com/markets/${m.ticker}`,
          endDate:   m.close_time,
          liquidity: m.liquidity,
        } as Market
      })
      .filter((m: Market | null): m is Market => m !== null)

    console.log(`Kalshi public API: ${markets.length} markets`)
    return markets
  } catch (err) {
    console.error('Kalshi fetch error:', String(err).slice(0, 150))
    return []
  }
}
