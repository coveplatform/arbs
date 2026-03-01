import { Market, ArbOpportunity } from './types'

// Only real-money platforms can generate genuine arbitrage
const REAL_MONEY = new Set(['polymarket', 'kalshi', 'smarkets', 'predictit', 'betfair'])

// Platform fees (approximate, applied to winnings)
const FEES: Record<string, number> = {
  polymarket: 0.02,  // 2% fee on winnings
  kalshi:     0.07,  // ~7% take rate
  smarkets:   0.02,  // 2% exchange commission
  predictit:  0.10,  // 10% fee on profits + 5% withdrawal
  betfair:    0.05,  // 5% commission on net winnings (market base rate)
  manifold:   0,     // play money — excluded from arb
  metaculus:  0,     // play money — excluded from arb
}

export function calculateArb(marketA: Market, marketB: Market): ArbOpportunity | null {
  // Never flag arb if either side is play money
  if (!REAL_MONEY.has(marketA.platform) || !REAL_MONEY.has(marketB.platform)) return null

  const feeA = FEES[marketA.platform] || 0
  const feeB = FEES[marketB.platform] || 0

  // Strategy 1: Buy YES on A, buy NO on B
  // Cost = yesPrice_A + noPrice_B
  // Payout if YES resolves: (1 - feeA) from A, 0 from B → net = (1-feeA) - cost
  // Payout if NO resolves:  0 from A, (1 - feeB) from B → net = (1-feeB) - cost
  const cost1 = marketA.yesPrice + marketB.noPrice
  const payoutYes1 = (1 - feeA)
  const payoutNo1 = (1 - feeB)
  const profit1 = Math.min(payoutYes1, payoutNo1) - cost1

  // Strategy 2: Buy NO on A, buy YES on B
  const cost2 = marketA.noPrice + marketB.yesPrice
  const payoutYes2 = (1 - feeB)
  const payoutNo2 = (1 - feeA)
  const profit2 = Math.min(payoutYes2, payoutNo2) - cost2

  // Pick best strategy
  const bestProfit = Math.max(profit1, profit2)

  // Only return if genuinely profitable (>0.5% after fees)
  // Also cap at 25% — anything higher means the markets aren't actually comparable
  if (bestProfit <= 0.005) return null
  if (bestProfit / Math.min(cost1, cost2) > 0.25) return null

  const useStrategy1 = profit1 >= profit2
  const cost = useStrategy1 ? cost1 : cost2
  const profitPercent = (bestProfit / cost) * 100

  return {
    type: useStrategy1 ? 'yes-no' : 'no-yes',
    costToBet: cost,
    profitPercent,
    betSideA: useStrategy1 ? 'yes' : 'no',
    betSideB: useStrategy1 ? 'no' : 'yes',
    priceA: useStrategy1 ? marketA.yesPrice : marketA.noPrice,
    priceB: useStrategy1 ? marketB.noPrice : marketB.yesPrice,
    maxProfit: bestProfit * 100,  // per $100 total bet
  }
}

export function formatProfit(opportunity: ArbOpportunity): string {
  return `+${opportunity.profitPercent.toFixed(2)}%`
}
