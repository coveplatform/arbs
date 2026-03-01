import { Market } from './types'

const KALSHI_PUBLIC = 'https://api.elections.kalshi.com/trade-api/v2'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ArbScanner/1.0)',
  'Accept': 'application/json',
}

// Sports series prefixes to skip (they produce multivariate, not binary, markets)
const SPORTS_PREFIXES = ['KXNBA', 'KXNFL', 'KXNCAA', 'KXMLB', 'KXNHL', 'KXSOCCER',
  'KXNASCAR', 'KXTENNIS', 'KXGOLF', 'KXMVE', 'KXMMA', 'KXUFC', 'KXBOXING']

async function fetchPage(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    if (res.status !== 429) {
      console.error(`Kalshi ${url} → HTTP ${res.status}: ${text.slice(0, 150)}`)
    }
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseMarkets(raw: any[]): Market[] {
  const results: Market[] = []
  for (const m of raw) {
    if (m.status && m.status !== 'active' && m.status !== 'open') continue

    const bid  = m.yes_bid  ?? 0
    const ask  = m.yes_ask  ?? 0
    const last = m.last_price ?? 0

    let yesMid = 0
    if (bid > 0 && ask > 0) {
      yesMid = ((bid + ask) / 2) / 100
    } else if (ask > 0) {
      yesMid = ask / 100
    } else if (bid > 0) {
      yesMid = bid / 100
    } else if (last > 0) {
      yesMid = last / 100
    } else {
      continue
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

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function fetchKalshiMarkets(): Promise<Market[]> {
  const eventsData = await fetchPage(`${KALSHI_PUBLIC}/events?limit=100&status=open`)
  if (!eventsData) {
    console.log('Kalshi: events endpoint failed')
    return []
  }

  const events: any[] = eventsData.events ?? eventsData.data ?? []
  console.log(`Kalshi: ${events.length} events found`)

  if (events.length === 0) {
    console.log(`Kalshi events response: ${JSON.stringify(eventsData).slice(0, 200)}`)
    return []
  }

  // Filter out sports events by ticker prefix
  const filtered = events.filter((e: any) => {
    const t: string = (e.event_ticker ?? e.ticker ?? '').toUpperCase()
    return !SPORTS_PREFIXES.some(p => t.startsWith(p))
  })
  console.log(`Kalshi: ${filtered.length} non-sports events after filtering`)

  const tickers: string[] = filtered.slice(0, 30).map((e: any) => e.event_ticker ?? e.ticker)

  // Sequential with small batch to avoid 429
  // 3 per batch, 800ms between batches
  const allRaw: any[] = []
  const BATCH = 3
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH)
    const pages = await Promise.all(
      batch.map(t => fetchPage(`${KALSHI_PUBLIC}/markets?event_ticker=${t}&limit=100`))
    )
    for (const page of pages) {
      if (page) {
        const markets = page.markets ?? page.data ?? []
        allRaw.push(...markets)
        successCount++
      } else {
        failCount++
      }
    }
    if (i + BATCH < tickers.length) {
      await sleep(800)
    }
  }

  console.log(`Kalshi: ${allRaw.length} raw markets (${successCount} ok, ${failCount} failed) from ${tickers.length} events`)

  if (allRaw.length === 0) return []

  if (allRaw.length > 0) {
    console.log(`Kalshi sample: ${JSON.stringify(allRaw[0]).slice(0, 200)}`)
  }

  const markets = parseMarkets(allRaw)
  console.log(`Kalshi: ${markets.length} markets parsed`)
  return markets
}
