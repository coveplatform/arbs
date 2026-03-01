import { Market } from './types'

interface PredictItContract {
  id: number
  name: string
  shortName: string
  status: string
  lastTradePrice: number
  bestBuyYesCost: number
  bestBuyNoCost: number
}

interface PredictItMarket {
  id: number
  name: string
  shortName: string
  url: string
  contracts: PredictItContract[]
  status: string
}

interface PredictItResponse {
  markets: PredictItMarket[]
}

export async function fetchPredictItMarkets(): Promise<Market[]> {
  try {
    const res = await fetch('https://www.predictit.org/api/marketdata/all/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.warn('PredictIt HTTP', res.status)
      return []
    }

    const data: PredictItResponse = await res.json()
    const markets: Market[] = []

    for (const m of data.markets || []) {
      if (m.status !== 'Open') continue

      // Binary market: exactly one YES/NO contract
      const open = m.contracts.filter(c => c.status === 'Open')
      if (open.length !== 1) continue

      const contract = open[0]
      const yesPrice = contract.bestBuyYesCost ?? contract.lastTradePrice ?? 0
      if (!yesPrice || yesPrice <= 0.01 || yesPrice >= 0.99) continue

      markets.push({
        id:       `predictit-${m.id}`,
        platform: 'predictit' as any,
        question: m.name,
        yesPrice,
        noPrice:  1 - yesPrice,
        volume:   0,
        url:      `https://www.predictit.org/markets/detail/${m.id}`,
      })
    }

    console.log(`PredictIt: ${markets.length} binary markets`)
    return markets
  } catch (err) {
    console.error('PredictIt fetch error:', String(err).slice(0, 100))
    return []
  }
}
