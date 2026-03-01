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
      // one retry
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

async function fetchEvents(): Promise<any[]> {
  // Try multiple Smarkets category slugs in parallel
  const queries = [
    '/events/?type=politics&state=upcoming&sort=id&limit=100',
    '/events/?type=current-affairs&state=upcoming&sort=id&limit=100',
    '/events/?type=american-politics&state=upcoming&sort=id&limit=100',
    '/events/?type=world-politics&state=upcoming&sort=id&limit=100',
    '/events/?type=economics&state=upcoming&sort=id&limit=50',
    '/events/?state=upcoming&sort=id&limit=50&with_bettable_children=true',
  ]

  const results = await Promise.all(queries.map(q => get(q)))
  const all: any[] = []
  const seen = new Set<string>()

  for (const r of results) {
    for (const e of r?.events ?? []) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        all.push(e)
      }
    }
  }

  console.log(`Smarkets: ${all.length} events found across all categories`)
  return all
}

async function processEvent(event: any, seenMarkets: Set<string>): Promise<Market[]> {
  const mData = await get(`/events/${event.id}/markets/`)
  if (!mData?.markets) return []

  const openMarkets = mData.markets.filter((m: any) => {
    if (m.state !== 'open' || seenMarkets.has(m.id)) return false
    seenMarkets.add(m.id)
    return true
  })

  const results = await Promise.all(openMarkets.map(async (market: any) => {
    const [cData, qData] = await Promise.all([
      get(`/markets/${market.id}/contracts/`),
      get(`/markets/${market.id}/quotes/`),
    ])
    if (!cData?.contracts || !qData) return null

    const open = cData.contracts.filter((c: any) => c.state_or_outcome === 'open')
    if (open.length !== 2) return null

    const yesC = open.find((c: any) => c.slug === 'yes')
    const noC  = open.find((c: any) => c.slug === 'no')
    if (!yesC || !noC) return null

    const yesQ = qData[yesC.id]
    if (!yesQ) return null

    const yesPrice = midpoint(yesQ.bids, yesQ.offers)
    if (yesPrice < 0.02 || yesPrice > 0.98) return null

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
  }))

  return results.filter((m): m is Market => m !== null)
}

export async function fetchSmarketsMarkets(): Promise<Market[]> {
  const events = await fetchEvents()
  if (events.length === 0) {
    console.log('Smarkets: no events returned')
    return []
  }

  const results: Market[] = []
  const seenMarkets = new Set<string>()
  const EVENT_CAP = 40
  const BATCH = 6

  for (let i = 0; i < Math.min(events.length, EVENT_CAP); i += BATCH) {
    const batch = events.slice(i, i + BATCH)
    const batchResults = await Promise.all(batch.map(e => processEvent(e, seenMarkets)))
    for (const r of batchResults) results.push(...r)
    if (i + BATCH < Math.min(events.length, EVENT_CAP)) {
      await new Promise(r => setTimeout(r, 150))
    }
  }

  console.log(`Smarkets: ${results.length} markets from ${Math.min(events.length, EVENT_CAP)} events`)
  return results
}
