import { Market } from './types'

export async function fetchKalshiMarkets(limit = 200): Promise<Market[]> {
  // Kalshi requires authentication — API key must be set in env vars
  if (!process.env.KALSHI_API_KEY) {
    console.log('Kalshi: no API key set, skipping')
    return []
  }

  try {
    const res = await fetch(
      `https://trading-api.kalshi.com/trade-api/v2/markets?limit=${limit}&status=open`,
      {
        headers: {
          'Authorization': `Token ${process.env.KALSHI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      }
    )
    if (!res.ok) throw new Error(`Kalshi API error: ${res.status}`)
    const data = await res.json()

    const markets = (data.markets ?? [])
      .filter((m: any) => m.status === 'open')
      .map((m: any) => {
        const yesMid = ((m.yes_bid + m.yes_ask) / 2) / 100
        const noMid  = ((m.no_bid + m.no_ask) / 2) / 100
        if (yesMid <= 0.01 || yesMid >= 0.99) return null
        return {
          id:       `kalshi-${m.ticker}`,
          platform: 'kalshi' as const,
          question: m.title,
          yesPrice: yesMid || 0.5,
          noPrice:  noMid || 0.5,
          volume:   m.volume ?? 0,
          url:      `https://kalshi.com/markets/${m.ticker}`,
          endDate:  m.close_time,
          liquidity: m.liquidity,
        } as Market
      })
      .filter((m: Market | null): m is Market => m !== null)

    console.log(`Kalshi: ${markets.length} markets`)
    return markets
  } catch (err) {
    console.error('Kalshi fetch error:', err)
    return []
  }
}
