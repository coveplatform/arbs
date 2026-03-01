import { Market } from './types'

const API = 'https://api.smarkets.com/v3'
const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
}

async function get(path: string): Promise<any> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1500))
      const r2 = await fetch(`${API}${path}`, {
        headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8000),
      })
      if (!r2.ok) return null
      return r2.json()
    }
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function midpoint(bids: any[], offers: any[]): number {
  const b = bids?.[0]?.price ?? 0
  const o = offers?.[0]?.price ?? 0
  if (!b && !o) return 0
  return ((b || o) + (o || b)) / 2 / 10000
}

async function priceFromQuotes(marketId: string, contractId: string | number): Promise<number> {
  const qData = await get(`/markets/${marketId}/quotes/`)
  if (!qData) return 0
  // Quotes are a flat dict keyed by contract ID (no wrapper)
  const q = qData[contractId] ?? qData[String(contractId)] ?? qData[Number(contractId)]
  if (!q) return 0
  return midpoint(q.bids, q.offers)
}

async function processMarket(market: any, event: any, seenMarkets: Set<string>): Promise<Market | null> {
  const tradeable = market.state === 'open' || market.state === 'live' || market.state === 'active'
  if (!tradeable || seenMarkets.has(market.id)) return null
  seenMarkets.add(market.id)

  const cData = await get(`/markets/${market.id}/contracts/`)
  if (!cData?.contracts) return null

  const open = cData.contracts.filter((c: any) =>
    c.state_or_outcome === 'open' || c.state_or_outcome === 'live' || c.state_or_outcome === 'active'
  )

  // Only handle binary markets (exactly 2 open contracts)
  if (open.length !== 2) return null

  const isYes = (c: any) => /^yes$/i.test(c.slug ?? '') || /^yes$/i.test(c.name ?? '')
  const isNo  = (c: any) => /^no$/i.test(c.slug ?? '')  || /^no$/i.test(c.name ?? '')

  const hasYesNo = open.some(isYes) && open.some(isNo)

  let yesC = hasYesNo ? open.find(isYes)! : open[0]
  let noC  = hasYesNo ? open.find(isNo)!  : open[1]
  if (!yesC || !noC || yesC === noC) return null

  // Always fetch from quotes (contracts never carry price fields)
  let yesPrice = await priceFromQuotes(market.id, yesC.id)
  if (!yesPrice && !hasYesNo) {
    // Try the other contract as "yes"
    yesPrice = await priceFromQuotes(market.id, noC.id)
    if (yesPrice) [yesC, noC] = [noC, yesC]
  }

  if (!yesPrice || yesPrice < 0.02 || yesPrice > 0.98) return null

  const question = market.name === event.name
    ? event.name
    : `${event.name} — ${market.name}`

  return {
    id:       `smarkets-${market.id}`,
    platform: 'smarkets' as const,
    question,
    yesPrice,
    noPrice:  1 - yesPrice,
    volume:   0,
    url:      `https://smarkets.com/event/${event.id}/politics`,
  } as Market
}

export async function fetchSmarketsMarkets(): Promise<Market[]> {
  // Fetch events from multiple political categories in parallel
  const queries = [
    '/events/?type=politics&state=upcoming&sort=id&limit=200',
    '/events/?type=current-affairs&state=upcoming&sort=id&limit=100',
    '/events/?type=american-politics&state=upcoming&sort=id&limit=100',
    '/events/?type=world-politics&state=upcoming&sort=id&limit=100',
    '/events/?type=economics&state=upcoming&sort=id&limit=100',
    '/events/?state=upcoming&sort=id&limit=100&with_bettable_children=true',
  ]

  const results = await Promise.all(queries.map(q => get(q)))
  const allEvents: any[] = []
  const seenEvents = new Set<string>()

  for (const r of results) {
    for (const e of r?.events ?? []) {
      if (!seenEvents.has(e.id)) {
        seenEvents.add(e.id)
        allEvents.push(e)
      }
    }
  }

  console.log(`Smarkets: ${allEvents.length} events found`)

  const markets: Market[] = []
  const seenMarkets = new Set<string>()
  const EVENT_CAP = 80
  const BATCH = 8

  let processed = 0
  let totalMarketsChecked = 0

  for (let i = 0; i < Math.min(allEvents.length, EVENT_CAP); i += BATCH) {
    const batch = allEvents.slice(i, i + BATCH)

    const batchMarkets = await Promise.all(batch.map(async (event: any) => {
      const mData = await get(`/events/${event.id}/markets/`)
      if (!mData?.markets) return []

      const tradeable = mData.markets.filter((m: any) =>
        m.state === 'open' || m.state === 'live' || m.state === 'active'
      )
      totalMarketsChecked += tradeable.length

      // Only process events that have at least one potentially binary market
      // (skip events with >10 markets — those are always multi-outcome election nights)
      const candidates = tradeable.filter((m: any) => m && !seenMarkets.has(m.id))

      const eventMarkets: Market[] = []
      for (const m of candidates) {
        const result = await processMarket(m, event, seenMarkets)
        if (result) eventMarkets.push(result)
      }
      processed++
      return eventMarkets
    }))

    for (const em of batchMarkets) markets.push(...em)

    if (i + BATCH < Math.min(allEvents.length, EVENT_CAP)) {
      await new Promise(r => setTimeout(r, 150))
    }
  }

  console.log(`Smarkets: ${markets.length} binary markets from ${processed} events (checked ${totalMarketsChecked} tradeable markets)`)
  return markets
}
