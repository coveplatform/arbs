import { NextResponse } from 'next/server'
import { fetchPolymarkets } from '@/lib/polymarket'
import { fetchKalshiMarkets } from '@/lib/kalshi'
import { fetchSmarketsMarkets } from '@/lib/smarkets'
import { fetchPredictItMarkets } from '@/lib/predictit'
import { fetchBetfairMarkets } from '@/lib/betfair'
import { matchMarkets } from '@/lib/matcher'
import { Market, MarketPair, ScanResult } from '@/lib/types'

export const maxDuration = 30

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))])
}

function byVolume(a: Market, b: Market) { return b.volume - a.volume }

export async function GET() {
  try {
    // Fetch all real-money platforms in parallel
    const [rawPoly, rawKalshi, rawSmarkets, rawPredictIt, rawBetfair] = await Promise.all([
      withTimeout(fetchPolymarkets(),       12000, [] as Market[]),
      withTimeout(fetchKalshiMarkets(200),  8000,  [] as Market[]),
      withTimeout(fetchSmarketsMarkets(),   20000, [] as Market[]),
      withTimeout(fetchPredictItMarkets(),  10000, [] as Market[]),
      withTimeout(fetchBetfairMarkets(),    10000, [] as Market[]),
    ])

    const poly      = rawPoly.sort(byVolume).slice(0, 200)
    const kalshi    = rawKalshi.sort(byVolume).slice(0, 120)
    const smarkets  = rawSmarkets
    const predictit = rawPredictIt
    const betfair   = rawBetfair.sort(byVolume).slice(0, 150)

    console.log(`Poly:${poly.length} Kalshi:${kalshi.length} Smarkets:${smarkets.length} PredictIt:${predictit.length} Betfair:${betfair.length}`)

    // All real-money cross-platform comparisons
    const [
      polyVsKalshi,
      polyVsSmarkets,
      polyVsPredictIt,
      smarketsVsPredictIt,
      kalshiVsSmarkets,
      polyVsBetfair,
      betfairVsPredictIt,
      betfairVsSmarkets,
    ] = await Promise.all([
      poly.length      && kalshi.length     ? matchMarkets(poly,      kalshi)     : Promise.resolve([] as MarketPair[]),
      poly.length      && smarkets.length   ? matchMarkets(poly,      smarkets)   : Promise.resolve([] as MarketPair[]),
      poly.length      && predictit.length  ? matchMarkets(poly,      predictit)  : Promise.resolve([] as MarketPair[]),
      smarkets.length  && predictit.length  ? matchMarkets(smarkets,  predictit)  : Promise.resolve([] as MarketPair[]),
      kalshi.length    && smarkets.length   ? matchMarkets(kalshi,    smarkets)   : Promise.resolve([] as MarketPair[]),
      betfair.length   && poly.length       ? matchMarkets(betfair,   poly)       : Promise.resolve([] as MarketPair[]),
      betfair.length   && predictit.length  ? matchMarkets(betfair,   predictit)  : Promise.resolve([] as MarketPair[]),
      betfair.length   && smarkets.length   ? matchMarkets(betfair,   smarkets)   : Promise.resolve([] as MarketPair[]),
    ])

    const seen = new Set<string>()
    const allPairs: MarketPair[] = []
    for (const pair of [...polyVsKalshi, ...polyVsSmarkets, ...polyVsPredictIt, ...smarketsVsPredictIt, ...kalshiVsSmarkets, ...polyVsBetfair, ...betfairVsPredictIt, ...betfairVsSmarkets]) {
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
        predictit:  predictit.length,
        betfair:    betfair.length,
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
