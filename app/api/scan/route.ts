import { NextResponse } from 'next/server'
import { fetchPolymarkets } from '@/lib/polymarket'
import { fetchKalshiMarkets } from '@/lib/kalshi'
import { fetchSmarketsMarkets } from '@/lib/smarkets'
import { fetchManifoldMarkets } from '@/lib/manifold'
import { fetchMetaculusMarkets } from '@/lib/metaculus'
import { matchMarkets } from '@/lib/matcher'
import { Market, MarketPair, ScanResult } from '@/lib/types'

export const maxDuration = 30

function byVolume(a: Market, b: Market) { return b.volume - a.volume }

export async function GET() {
  try {
    // Fetch all platforms in parallel
    const [rawPoly, rawKalshi, rawSmarkets, rawManifold, rawMetaculus] = await Promise.all([
      fetchPolymarkets(),
      fetchKalshiMarkets(200),
      fetchSmarketsMarkets(),
      fetchManifoldMarkets(),
      fetchMetaculusMarkets(150),
    ])

    // Sort and cap each pool
    const poly      = rawPoly.sort(byVolume).slice(0, 150)
    const kalshi    = rawKalshi.sort(byVolume).slice(0, 120)
    const smarkets  = rawSmarkets                              // already limited by event cap
    const manifold  = rawManifold.sort(byVolume).slice(0, 200)
    const metaculus = rawMetaculus.sort(byVolume).slice(0, 120)

    console.log(`Poly:${poly.length} Kalshi:${kalshi.length} Smarkets:${smarkets.length} Manifold:${manifold.length} Metaculus:${metaculus.length}`)

    // Run cross-platform comparisons in parallel
    // Priority order: real-money × real-money first, then vs forecasting platforms
    const [
      polyVsKalshi,
      polyVsSmarkets,
      kalshiVsSmarkets,
      polyVsManifold,
      smarketsVsManifold,
    ] = await Promise.all([
      poly.length   && kalshi.length   ? matchMarkets(poly,     kalshi)   : Promise.resolve([] as MarketPair[]),
      poly.length   && smarkets.length ? matchMarkets(poly,     smarkets) : Promise.resolve([] as MarketPair[]),
      kalshi.length && smarkets.length ? matchMarkets(kalshi,   smarkets) : Promise.resolve([] as MarketPair[]),
      poly.length   && manifold.length ? matchMarkets(poly,     manifold) : Promise.resolve([] as MarketPair[]),
      smarkets.length && manifold.length ? matchMarkets(smarkets, manifold) : Promise.resolve([] as MarketPair[]),
    ])

    // Merge all pairs, deduplicating by id
    const seen = new Set<string>()
    const allPairs: MarketPair[] = []
    const streams = [
      polyVsKalshi, polyVsSmarkets, kalshiVsSmarkets,
      polyVsManifold, smarketsVsManifold,
    ]
    for (const stream of streams) {
      for (const pair of stream) {
        if (!seen.has(pair.id)) {
          seen.add(pair.id)
          allPairs.push(pair)
        }
      }
    }

    // Sort: arb opportunities first, then by similarity
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
        metaculus:  metaculus.length,
      },
      opportunitiesFound: allPairs.filter(p => p.arbOpportunity !== null).length,
      // backward-compat
      polymarketCount: poly.length,
      kalshiCount:     kalshi.length,
      metaculusCount:  metaculus.length,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('Scan error:', err)
    return NextResponse.json({ error: 'Scan failed', message: String(err) }, { status: 500 })
  }
}
