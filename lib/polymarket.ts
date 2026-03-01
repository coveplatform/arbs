import { Market } from './types'

const ENDPOINTS = [
  'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=200&order=volume&ascending=false',
  'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&order=volume&ascending=false',
]

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

export async function fetchPolymarkets(): Promise<Market[]> {
  let data: PolymarketRaw[] = []

  for (const url of ENDPOINTS) {
    try {
      data = await tryFetch(url)
      if (data.length > 0) break
    } catch (err) {
      console.warn('Polymarket endpoint failed, retrying...', String(err).slice(0, 80))
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  if (!data.length) {
    console.error('All Polymarket endpoints failed')
    return []
  }

  return data
    .filter(m => m.active && !m.closed)
    .map(m => {
      let yesPrice = 0.5, noPrice = 0.5
      try {
        const prices = JSON.parse(m.outcomePrices)
        yesPrice = parseFloat(prices[0]) || 0.5
        noPrice  = parseFloat(prices[1]) || (1 - yesPrice)
      } catch {}
      return {
        id:       `poly-${m.id}`,
        platform: 'polymarket' as const,
        question: m.question,
        yesPrice,
        noPrice,
        volume:   parseFloat(m.volume) || 0,
        url:      `https://polymarket.com/event/${m.id}`,
        endDate:  m.endDate,
        liquidity:parseFloat(m.liquidity || '0'),
      }
    })
    .filter(m => m.yesPrice > 0.01 && m.yesPrice < 0.99)
}
