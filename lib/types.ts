export interface Market {
  id: string
  platform: 'polymarket' | 'kalshi' | 'manifold' | 'metaculus' | 'smarkets' | 'predictit' | 'betfair'
  question: string
  yesPrice: number  // 0-1
  noPrice: number   // 0-1
  volume: number
  url: string
  endDate?: string
  liquidity?: number
}

export interface MarketPair {
  id: string
  marketA: Market
  marketB: Market
  similarity: number
  arbOpportunity: ArbOpportunity | null
}

export interface ArbOpportunity {
  type: 'yes-no' | 'no-yes'
  costToBet: number
  profitPercent: number
  betSideA: 'yes' | 'no'
  betSideB: 'yes' | 'no'
  priceA: number
  priceB: number
  maxProfit: number
}

export interface ScanResult {
  pairs: MarketPair[]
  scannedAt: string
  counts: Record<string, number>
  opportunitiesFound: number
  // backward-compat fields
  polymarketCount: number
  kalshiCount: number
  metaculusCount: number
}
