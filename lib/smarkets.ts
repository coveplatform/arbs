import { Market } from './types'

const API = 'https://api.smarkets.com/v3'
const H   = { Accept: 'application/json' }

async function get(path: string, retries = 1): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: H, cache: 'no-store', signal: AbortSignal.timeout(4000),
      })
      if (res.status === 429) {
        // Rate limited — wait and retry
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      if (!res.ok) return null
      return res.json()
    } catch {
      if (attempt === retries) return null
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return null
}

function midpoint(bids: any[], offers: any[]): number {
  const b = bids?.[0]?.price ?? 0
  const o = offers?.[0]?.price ?? 0
  if (!b && !o) return 0
  return ((b || o) + (o || b)) / 2 / 10000
}

// Fetch events across multiple categories
async function fetchEvents(): Promise<any[]> {
  const [politics, currentAffairs, current] = await Promise.all([
    get('/events/?type=politics&state=upcoming&limit=100'),
    get('/events/?type=current-affairs&state=upcoming&limit=50'),
    get('/events/?state=upcoming&limit=50&with_bettable_children=true'),
  ])
  const all = [
    ...(politics?.events ?? []),
    ...(currentAffairs?.events ?? []),
    ...(current?.events ?? []),
  ]
  // Deduplicate by event id
  const seen = new Set<string>()
  return all.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })
}

async function processEvent(event: any, seenMarkets: Set<string>): Promise<Market[]> {
  const mData = await get(`/events/${event.id}/markets/`)
  if (!mData?.markets) return []

  const markets: Market[] = []
  for (const market of mData.markets) {
    if (market.state !== 'open') continue
    if (seenMarkets.has(market.id)) continue
    seenMarkets.add(market.id)

    const [cData, qData] = await Promise.all([
      get(`/markets/${market.id}/contracts/`),
      get(`/markets/${market.id}/quotes/`),
    ])
    if (!cData?.contracts || !qData) continue

    const open = cData.contracts.filter((c: any) => c.state_or_outcome === 'open')
    if (open.length !== 2) continue           // binary only

    const yesC = open.find((c: any) => c.slug === 'yes')
    const noC  = open.find((c: any) => c.slug === 'no')
    if (!yesC || !noC) continue

    const yesQ = qData[yesC.id]
    if (!yesQ) continue

    const yesPrice = midpoint(yesQ.bids, yesQ.offers)
    if (yesPrice < 0.02 || yesPrice > 0.98) continue

    const question = market.name === event.name
      ? event.name
      : `${event.name} — ${market.name}`

    markets.push({
      id:       `smarkets-${market.id}`,
      platform: 'smarkets' as const,
      question,
      yesPrice,
      noPrice:  1 - yesPrice,
      volume:   0,
      url:      `https://smarkets.com/event/${event.id}/politics`,
    })
  }
  return markets
}

export async function fetchSmarketsMarkets(): Promise<Market[]> {
  const events = await fetchEvents()
  if (events.length === 0) return []

  const results: Market[] = []
  const seenMarkets = new Set<string>()

  // Process in small batches to avoid rate limiting
  const BATCH = 5
  const EVENT_CAP = 20
  for (let i = 0; i < Math.min(events.length, EVENT_CAP); i += BATCH) {
    const batch = events.slice(i, i + BATCH)
    const batchResults = await Promise.all(batch.map(e => processEvent(e, seenMarkets)))
    for (const r of batchResults) results.push(...r)
    if (i + BATCH < Math.min(events.length, EVENT_CAP)) {
      await new Promise(r => setTimeout(r, 100))
    }
  }

  return results
}
