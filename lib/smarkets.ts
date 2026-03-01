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

export async function fetchSmarketsMarkets(): Promise<Market[]> {
  // Fetch events from multiple political categories in parallel
  const queries = [
    '/events/?type=politics&state=upcoming&sort=id&limit=200',
    '/events/?type=current-affairs&state=upcoming&sort=id&limit=100',
    '/events/?type=american-politics&state=upcoming&sort=id&limit=100',
    '/events/?type=world-politics&state=upcoming&sort=id&limit=100',
    '/events/?type=economics&state=upcoming&sort=id&limit=50',
    '/events/?type=novelty&state=upcoming&sort=id&limit=50',
    '/events/?type=entertainment&state=upcoming&sort=id&limit=50',
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
  if (allEvents.length === 0) return []

  // Fetch markets for all events in parallel batches
  const EVENT_CAP = 60
  const BATCH = 10
  const allMarkets: { market: any; event: any }[] = []
  const seenMarkets = new Set<string>()

  for (let i = 0; i < Math.min(allEvents.length, EVENT_CAP); i += BATCH) {
    const batch = allEvents.slice(i, i + BATCH)
    const pages = await Promise.all(batch.map((e: any) => get(`/events/${e.id}/markets/`)))

    for (let j = 0; j < batch.length; j++) {
      const mData = pages[j]
      if (!mData?.markets) continue
      for (const m of mData.markets) {
        const tradeable = m.state === 'open' || m.state === 'live' || m.state === 'active'
        if (!tradeable || seenMarkets.has(m.id)) continue
        seenMarkets.add(m.id)
        allMarkets.push({ market: m, event: batch[j] })
      }
    }

    if (i + BATCH < Math.min(allEvents.length, EVENT_CAP)) {
      await new Promise(r => setTimeout(r, 100))
    }
  }

  console.log(`Smarkets: ${allMarkets.length} tradeable markets found`)

  // Log a sample market object to see available fields
  if (allMarkets.length > 0) {
    console.log(`Smarkets sample market fields: ${JSON.stringify(allMarkets[0].market).slice(0, 300)}`)
  }

  // Now fetch contracts for each market — only keep binary (2 contracts)
  const outputMarkets: Market[] = []
  const CONTRACT_BATCH = 6

  for (let i = 0; i < allMarkets.length; i += CONTRACT_BATCH) {
    const batch = allMarkets.slice(i, i + CONTRACT_BATCH)
    const contractPages = await Promise.all(
      batch.map(({ market }) => get(`/markets/${market.id}/contracts/`))
    )

    for (let j = 0; j < batch.length; j++) {
      const { market, event } = batch[j]
      const cData = contractPages[j]
      if (!cData?.contracts) continue

      const open = cData.contracts.filter((c: any) =>
        c.state_or_outcome === 'open' || c.state_or_outcome === 'live' || c.state_or_outcome === 'active'
      )

      if (open.length !== 2) continue

      const isYes = (c: any) => /^yes$/i.test(c.slug ?? '') || /^yes$/i.test(c.name ?? '')
      const isNo  = (c: any) => /^no$/i.test(c.slug ?? '')  || /^no$/i.test(c.name ?? '')
      const hasYesNo = open.some(isYes) && open.some(isNo)

      const yesC = hasYesNo ? open.find(isYes)! : open[0]
      const noC  = hasYesNo ? open.find(isNo)!  : open[1]
      if (!yesC || !noC || yesC === noC) continue

      // Log the first binary market's contract structure for debugging
      if (outputMarkets.length === 0) {
        console.log(`Smarkets first binary market: ${market.name} | contracts: ${JSON.stringify(open).slice(0, 200)}`)
      }

      // Fetch quotes (contracts have no price fields — all prices are in quotes)
      const qData = await get(`/markets/${market.id}/quotes/`)
      if (!qData) continue

      // Quotes are a flat dict keyed by contract ID (no wrapper key)
      const yesQ = qData[yesC.id] ?? qData[String(yesC.id)]
      if (!yesQ) continue

      const yesPrice = midpoint(yesQ.bids, yesQ.offers)
      if (!yesPrice || yesPrice < 0.02 || yesPrice > 0.98) continue

      const question = market.name === event.name
        ? event.name
        : `${event.name} — ${market.name}`

      outputMarkets.push({
        id:       `smarkets-${market.id}`,
        platform: 'smarkets' as const,
        question,
        yesPrice,
        noPrice:  1 - yesPrice,
        volume:   0,
        url:      `https://smarkets.com/event/${event.id}/politics`,
      } as Market)
    }

    if (i + CONTRACT_BATCH < allMarkets.length) {
      await new Promise(r => setTimeout(r, 100))
    }
  }

  console.log(`Smarkets: ${outputMarkets.length} binary markets from ${allMarkets.length} tradeable`)
  return outputMarkets
}
