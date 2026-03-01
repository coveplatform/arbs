import { Market } from './types'

const KALSHI_PUBLIC = 'https://api.elections.kalshi.com/trade-api/v2'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ArbScanner/1.0)',
  'Accept': 'application/json',
}

async function fetchPage(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`Kalshi ${url} → HTTP ${res.status}: ${text.slice(0, 200)}`)
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    console.error(`Kalshi non-JSON response: ${text.slice(0, 200)}`)
    return null
  }
}

function parseMarkets(raw: any[]): Market[] {
  return raw
    .filter((m: any) => m.status === 'open' || !m.status)
    .flatMap((m: any) => {
      const yesMid = m.yes_ask != null && m.yes_bid != null
        ? ((m.yes_bid + m.yes_ask) / 2) / 100
        : m.last_price != null ? m.last_price / 100
        : 0.5
      if (yesMid <= 0.01 || yesMid >= 0.99) return []
      return [{
        id:       `kalshi-${m.ticker}`,
        platform: 'kalshi' as const,
        question: m.title ?? m.subtitle ?? m.ticker,
        yesPrice: yesMid,
        noPrice:  1 - yesMid,
        volume:   m.volume ?? 0,
        url:      `https://kalshi.com/markets/${m.ticker}`,
        endDate:  m.close_time,
        liquidity: m.liquidity,
      } as Market]
    })
}

export async function fetchKalshiMarkets(limit = 200): Promise<Market[]> {
  // Approach 1: direct market listing (public, no auth)
  const data = await fetchPage(`${KALSHI_PUBLIC}/markets?limit=${limit}`)
  if (data) {
    // Log shape so we can see what comes back
    const keys = Object.keys(data)
    const marketCount = data.markets?.length ?? data.data?.length ?? 0
    console.log(`Kalshi API response keys: [${keys.join(',')}] markets=${marketCount}`)

    const raw = data.markets ?? data.data ?? data.result ?? (Array.isArray(data) ? data : [])
    if (raw.length > 0) {
      console.log(`Kalshi sample market: ${JSON.stringify(raw[0]).slice(0, 200)}`)
      const markets = parseMarkets(raw)
      console.log(`Kalshi: ${markets.length} markets parsed from ${raw.length} raw`)
      return markets
    }
  }

  // Approach 2: fetch via events endpoint then get markets per event
  console.log('Kalshi direct markets empty, trying events approach...')
  const eventsData = await fetchPage(`${KALSHI_PUBLIC}/events?limit=100&status=open`)
  if (!eventsData) return []

  const events = eventsData.events ?? eventsData.data ?? []
  console.log(`Kalshi events: ${events.length} found`)
  if (events.length === 0) {
    console.log(`Kalshi events response: ${JSON.stringify(eventsData).slice(0, 300)}`)
    return []
  }

  // Fetch markets for first batch of events in parallel
  const eventTickers = events.slice(0, 20).map((e: any) => e.event_ticker ?? e.ticker)
  const marketPages = await Promise.all(
    eventTickers.map((t: string) =>
      fetchPage(`${KALSHI_PUBLIC}/markets?event_ticker=${t}&status=open`).catch(() => null)
    )
  )

  const allRaw = marketPages.flatMap(d => d?.markets ?? d?.data ?? [])
  console.log(`Kalshi via events: ${allRaw.length} raw markets`)
  return parseMarkets(allRaw)
}
