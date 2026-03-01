import { NextResponse } from 'next/server'
import { fetchPolymarkets } from '@/lib/polymarket'
import { fetchKalshiMarkets } from '@/lib/kalshi'
import { fetchSmarketsMarkets } from '@/lib/smarkets'
import { fetchManifoldMarkets } from '@/lib/manifold'
import { matchMarkets } from '@/lib/matcher'
import { Market, MarketPair, ScanResult } from '@/lib/types'

export const maxDuration = 30

// Resolve a promise within `ms` milliseconds, or return the fallback
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))])
}

function byVolume(a: Market, b: Market) { return b.volume - a.volume }

export async function GET() {
  try {
    // Fetch all platforms in parallel, each with a hard timeout
    const [rawPoly, rawKalshi, rawSmarkets, rawManifold] = await Promise.all([
      withTimeout(fetchPolymarkets(),      10000, [] as Market[]),
      withTimeout(fetchKalshiMarkets(150), 8000,  [] as Market[]),
      withTimeout(fetchSmarketsMarkets(),  18000, [] as Market[]),
      withTimeout(fetchManifoldMarkets(),  10000, [] as Market[]),
    ])

    const poly     = rawPoly.sort(byVolume).slice(0, 120)
    const kalshi   = rawKalshi.sort(byVolume).slice(0, 100)
    const smarkets = rawSmarkets
    const manifold = rawManifold.sort(byVolume).slice(0, 150)

    console.log(`Poly:${poly.length} Kalshi:${kalshi.length} Smarkets:${smarkets.length} Manifold:${manifold.length}`)

    // Run cross-platform comparisons in parallel (2 GPT batches each = fast)
    const [
      polyVsKalshi,
      polyVsSmarkets,
      polyVsManifold,
      smarketsVsManifold,
    ] = await Promise.all([
      poly.length   && kalshi.length   ? matchMarkets(poly,     kalshi)   : Promise.resolve([] as MarketPair[]),
      poly.length   && smarkets.length ? matchMarkets(poly,     smarkets) : Promise.resolve([] as MarketPair[]),
      poly.length   && manifold.length ? matchMarkets(poly,     manifold) : Promise.resolve([] as MarketPair[]),
      smarkets.length && manifold.length ? matchMarkets(smarkets, manifold) : Promise.resolve([] as MarketPair[]),
    ])

    // Merge, deduplicating by pair id
    const seen = new Set<string>()
    const allPairs: MarketPair[] = []
    for (const pair of [...polyVsKalshi, ...polyVsSmarkets, ...polyVsManifold, ...smarketsVsManifold]) {
      if (!seen.has(pair.id)) {
        seen.add(pair.id)
        allPairs.push(pair)
      }
    }

    allPairs.sort((a, b) => {
      const aP = a.arbOpportunity?.profitPercent ?? -1
      const bP = b.arbOpportunity?.profitPercent ?? -1
      return bP - aP
    })

    const result: ScanResult = {
      pairs:             allPairs,
      scannedAt:         new Date().toISOString(),
      counts: {
        polymarket: poly.length,
        kalshi:     kalshi.length,
        smarkets:   smarkets.length,
        manifold:   manifold.length,
      },
      opportunitiesFound: allPairs.filter(p => p.arbOpportunity !== null).length,
      polymarketCount: poly.length,
      kalshiCount:     kalshi.length,
      metaculusCount:  0,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('Scan error:', err)
    return NextResponse.json({ error: 'Scan failed', message: String(err) }, { status: 500 })
  }
}
