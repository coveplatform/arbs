import { Market } from './types'

const KALSHI_API = 'https://trading-api.kalshi.com/trade-api/v2'

interface KalshiMarket {
  ticker: string
  title: string
  yes_bid: number    // cents (0-100)
  yes_ask: number
  no_bid: number
  no_ask: number
  volume: number
  close_time: string
  status: string
  liquidity?: number
}

interface KalshiResponse {
  markets: KalshiMarket[]
  cursor?: string
}

export async function fetchKalshiMarkets(limit = 100): Promise<Market[]> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Add API key if configured
    if (process.env.KALSHI_API_KEY) {
      headers['Authorization'] = `Token ${process.env.KALSHI_API_KEY}`
    }

    const res = await fetch(
      `${KALSHI_API}/markets?limit=${limit}&status=open`,
      { headers, next: { revalidate: 30 } }
    )

    if (!res.ok) throw new Error(`Kalshi API error: ${res.status}`)
    const data: KalshiResponse = await res.json()

    return (data.markets || [])
      .filter(m => m.status === 'open')
      .map(m => {
        // Use midpoint of bid/ask
        const yesMid = ((m.yes_bid + m.yes_ask) / 2) / 100
        const noMid = ((m.no_bid + m.no_ask) / 2) / 100

        return {
          id: `kalshi-${m.ticker}`,
          platform: 'kalshi' as const,
          question: m.title,
          yesPrice: yesMid || 0.5,
          noPrice: noMid || 0.5,
          volume: m.volume || 0,
          url: `https://kalshi.com/markets/${m.ticker}`,
          endDate: m.close_time,
          liquidity: m.liquidity,
        }
      })
      .filter(m => m.yesPrice > 0.01 && m.yesPrice < 0.99)
  } catch (err) {
    console.error('Kalshi fetch error:', err)
    return []
  }
}
