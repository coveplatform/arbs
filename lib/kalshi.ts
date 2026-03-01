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
  const results: Market[] = []
  for (const m of raw) {
    // Accept active OR open markets
    if (m.status && m.status !== 'active' && m.status !== 'open') continue

    // Compute yes midpoint — prefer bid/ask spread, fallback to last_price
    let yesMid = 0
    const bid = m.yes_bid ?? 0
    const ask = m.yes_ask ?? 0
    const last = m.last_price ?? 0

    if (bid > 0 && ask > 0) {
      yesMid = ((bid + ask) / 2) / 100
    } else if (ask > 0) {
      yesMid = ask / 100
    } else if (bid > 0) {
      yesMid = bid / 100
    } else if (last > 0) {
      yesMid = last / 100
    } else {
      continue // no price data — skip
    }

    if (yesMid <= 0.01 || yesMid >= 0.99) continue

    results.push({
      id:        `kalshi-${m.ticker}`,
      platform:  'kalshi' as const,
      question:  m.title ?? m.subtitle ?? m.ticker,
      yesPrice:  yesMid,
      noPrice:   1 - yesMid,
      volume:    m.volume ?? 0,
      url:       `https://kalshi.com/markets/${m.ticker_display ?? m.ticker}`,
      endDate:   m.close_time,
      liquidity: m.liquidity,
    } as Market)
  }
  return results
}

export async function fetchKalshiMarkets(): Promise<Market[]> {
  // Step 1: Get political/news events
  const eventsData = await fetchPage(`${KALSHI_PUBLIC}/events?limit=100&status=open`)
  if (!eventsData) {
    console.log('Kalshi: events endpoint failed')
    return []
  }

  const events: any[] = eventsData.events ?? eventsData.data ?? []
  console.log(`Kalshi: ${events.length} events found`)

  if (events.length === 0) {
    console.log(`Kalshi events response shape: ${JSON.stringify(eventsData).slice(0, 300)}`)
    return []
  }

  // Log first few event tickers so we can see the format
  const sampleTickers = events.slice(0, 5).map((e: any) => e.event_ticker ?? e.ticker)
  console.log(`Kalshi sample event tickers: ${sampleTickers.join(', ')}`)

  // Step 2: For each event, fetch its markets (NO status filter — status=active causes 0 results)
  const eventTickers: string[] = events.slice(0, 40).map((e: any) => e.event_ticker ?? e.ticker)

  // Batch requests to avoid hitting rate limits
  const BATCH = 10
  const allRaw: any[] = []

  for (let i = 0; i < eventTickers.length; i += BATCH) {
    const batch = eventTickers.slice(i, i + BATCH)
    const pages = await Promise.all(
      batch.map(t => fetchPage(`${KALSHI_PUBLIC}/markets?event_ticker=${t}&limit=100`).catch(() => null))
    )
    for (const page of pages) {
      const markets = page?.markets ?? page?.data ?? []
      allRaw.push(...markets)
    }
    if (i + BATCH < eventTickers.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  console.log(`Kalshi: ${allRaw.length} raw markets from ${eventTickers.length} events`)

  if (allRaw.length === 0) {
    // Fallback: try direct markets endpoint (usually sports, but worth a try)
    console.log('Kalshi: no markets via events, trying direct /markets endpoint...')
    const direct = await fetchPage(`${KALSHI_PUBLIC}/markets?limit=200`)
    const raw2 = direct?.markets ?? direct?.data ?? []
    console.log(`Kalshi direct: ${raw2.length} raw, statuses: ${[...new Set(raw2.map((m:any) => m.status))].join(',')}`)
    if (raw2.length > 0) {
      console.log(`Kalshi direct sample: ${JSON.stringify(raw2[0]).slice(0, 300)}`)
    }
    const parsed2 = parseMarkets(raw2)
    console.log(`Kalshi direct: ${parsed2.length} markets parsed`)
    return parsed2
  }

  // Log a sample market to confirm field names
  if (allRaw.length > 0) {
    console.log(`Kalshi sample market: ${JSON.stringify(allRaw[0]).slice(0, 300)}`)
  }

  const markets = parseMarkets(allRaw)
  console.log(`Kalshi: ${markets.length} markets parsed from ${allRaw.length} raw`)
  return markets
}
