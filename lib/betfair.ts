import { Market } from './types'

// Betfair's public readonly exchange API (used by their website without login)
// Political markets = event type 2378961
const BF_READONLY = 'https://www.betfair.com/www/sports/exchange/readonly/v1.0'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Referer': 'https://www.betfair.com/exchange/plus/politics',
}

async function bfGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${BF_READONLY}${path}`, {
      headers: HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.warn(`Betfair ${path} → HTTP ${res.status}`)
      return null
    }
    return res.json()
  } catch (err) {
    console.warn('Betfair fetch error:', String(err).slice(0, 100))
    return null
  }
}

// Convert decimal back odds to probability (YES price)
function decimalToProb(decimal: number): number {
  if (!decimal || decimal <= 1) return 0
  return 1 / decimal
}

export async function fetchBetfairMarkets(): Promise<Market[]> {
  // Fetch political markets overview (event type 2378961 = Politics)
  // Also try 468328 (current affairs) and 2764691 (US Politics)
  const [politicsData, usData] = await Promise.all([
    bfGet('/byeventtype?eventTypeIds=2378961&alt=json&locale=en_GB&types=MARKET_CATALOGUE,MARKET_ODDS'),
    bfGet('/byeventtype?eventTypeIds=2764691&alt=json&locale=en_GB&types=MARKET_CATALOGUE,MARKET_ODDS'),
  ])

  const markets: Market[] = []
  const seen = new Set<string>()

  for (const data of [politicsData, usData]) {
    if (!data) continue

    // Try various response shapes Betfair might return
    const marketList: any[] =
      data.markets ??
      data.attached?.markets ??
      data.result?.markets ??
      data.eventTypes?.flatMap((et: any) => et.markets ?? []) ??
      []

    for (const m of marketList) {
      const marketId: string = m.id ?? m.marketId
      if (!marketId || seen.has(marketId)) continue

      const runners: any[] = m.runners ?? []
      // Only handle binary markets: exactly 2 active runners named Yes/No or similar
      const active = runners.filter((r: any) => r.status !== 'REMOVED' && r.status !== 'LOSER')
      if (active.length !== 2) continue

      const r0 = active[0]
      const r1 = active[1]
      const name0: string = (r0.name ?? r0.runnerName ?? '').toLowerCase()
      const name1: string = (r1.name ?? r1.runnerName ?? '').toLowerCase()

      // Must be a yes/no binary market
      const isYesNo = (name0.includes('yes') && name1.includes('no')) ||
                      (name0.includes('no') && name1.includes('yes'))
      if (!isYesNo) continue

      const yesRunner = name0.includes('yes') ? r0 : r1
      const noRunner  = name0.includes('no')  ? r0 : r1

      // Get best back (buy YES/NO) price from exchange data
      const yesBack = yesRunner.ex?.availableToBack?.[0]?.price ??
                      yesRunner.lastPriceTraded ?? 0
      const noBack  = noRunner.ex?.availableToBack?.[0]?.price ??
                      noRunner.lastPriceTraded ?? 0

      const yesPrice = decimalToProb(yesBack)
      const noPrice  = decimalToProb(noBack)

      if (yesPrice < 0.02 || yesPrice > 0.98) continue

      const marketName: string = m.name ?? m.marketName ?? m.eventName ?? 'Unknown'
      const eventName: string  = m.event?.name ?? m.eventName ?? ''
      const question = eventName && eventName !== marketName
        ? `${eventName} — ${marketName}`
        : marketName

      seen.add(marketId)
      markets.push({
        id:       `betfair-${marketId}`,
        platform: 'betfair' as any,
        question,
        yesPrice,
        noPrice,
        volume:   m.totalMatched ?? m.volume ?? 0,
        url:      `https://www.betfair.com/exchange/plus/politics/market/${marketId}`,
        endDate:  m.marketTime ?? m.endDate,
      })
    }
  }

  console.log(`Betfair: ${markets.length} binary political markets`)
  return markets
}
