'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScanResult, MarketPair, Market } from '@/lib/types'

// ── Platform config ───────────────────────────────────────────────────────────
const P = {
  polymarket: { color: '#4f7eff', label: 'POLY', name: 'Polymarket' },
  kalshi:     { color: '#00d4aa', label: 'KALS', name: 'Kalshi'     },
  smarkets:   { color: '#e85d4a', label: 'SMKT', name: 'Smarkets'   },
  predictit:  { color: '#f5a623', label: 'PRDT', name: 'PredictIt'  },
} as const
type PKey = keyof typeof P
const plat = (k: string) => P[k as PKey] ?? { color: '#666', label: k.slice(0,4).toUpperCase(), name: k }

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (p: number) => (p * 100).toFixed(1)
const fmtVol = (v: number) =>
  v >= 1e6 ? `$${(v/1e6).toFixed(1)}m` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}k` : `$${Math.round(v)}`

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ platform }: { platform: string }) {
  const { color, label } = plat(platform)
  return (
    <span style={{
      fontFamily: 'var(--f-mono)',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.12em',
      background: color + '1a',
      color,
      border: `1px solid ${color}35`,
      borderRadius: 4,
      padding: '2px 7px',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '22px 24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div className="skeleton" style={{ width: 44, height: 18 }} />
        <div className="skeleton" style={{ width: 44, height: 18 }} />
        <div className="skeleton" style={{ width: 60, height: 18, marginLeft: 'auto' }} />
      </div>
      <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '55%', marginBottom: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="skeleton" style={{ height: 80 }} />
        <div className="skeleton" style={{ height: 80 }} />
      </div>
    </div>
  )
}

// ── Price block ───────────────────────────────────────────────────────────────
function PriceBlock({
  market, side, highlight,
}: { market: Market; side: 'yes' | 'no'; highlight: boolean }) {
  const p     = plat(market.platform)
  const price = side === 'yes' ? market.yesPrice : market.noPrice
  return (
    <div style={{
      background:   highlight ? p.color + '12' : 'var(--s2)',
      border:       `1px solid ${highlight ? p.color + '35' : 'var(--border)'}`,
      borderRadius: 8,
      padding:      '14px 16px',
      transition:   'all .2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Chip platform={market.platform} />
        {highlight && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, fontWeight: 700, color: p.color, letterSpacing: '0.1em' }}>
            BUY ↗
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{
          fontFamily:  'var(--f-mono)',
          fontSize:    30,
          fontWeight:  700,
          color:       highlight ? p.color : 'var(--text)',
          lineHeight:  1,
        }}>{fmt(price)}</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text3)' }}>¢</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text2)', marginLeft: 2 }}>{side.toUpperCase()}</span>
      </div>
      {market.volume > 0 && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
          {fmtVol(market.volume)} vol
        </div>
      )}
    </div>
  )
}

// ── Pair card ─────────────────────────────────────────────────────────────────
function PairCard({ pair, index }: { pair: MarketPair; index: number }) {
  const arb  = pair.arbOpportunity
  const [open, setOpen] = useState(false)

  return (
    <article
      className={arb ? 'arb-glow' : ''}
      onClick={() => setOpen(o => !o)}
      style={{
        animationDelay:  `${Math.min(index * 30, 300)}ms`,
        background:      arb ? 'linear-gradient(135deg, #0c1a06 0%, #0a0f0a 100%)' : 'var(--s1)',
        border:          `1px solid ${arb ? 'var(--lime-mid)' : 'var(--border)'}`,
        borderLeft:      arb ? '3px solid var(--lime)' : `1px solid var(--border)`,
        borderRadius:    'var(--radius)',
        padding:         '20px 24px',
        cursor:          'pointer',
        transition:      'border-color .2s, background .2s',
        position:        'relative',
        overflow:        'hidden',
      }}
      onMouseEnter={e => { if (!arb) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)' }}
      onMouseLeave={e => { if (!arb) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      {arb && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at top left, #b8ff5708 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Row 1: platforms + similarity + profit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
        <Chip platform={pair.marketA.platform} />
        <span style={{ color: 'var(--text3)', fontSize: 10 }}>×</span>
        <Chip platform={pair.marketB.platform} />
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 2 }}>
          {(pair.similarity * 100).toFixed(0)}% match
        </span>
        {arb ? (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              background:    'var(--lime)',
              color:         '#000',
              fontFamily:    'var(--f-mono)',
              fontWeight:    700,
              fontSize:      12,
              borderRadius:  5,
              padding:       '3px 10px',
              letterSpacing: '0.04em',
            }}>
              +{arb.profitPercent.toFixed(2)}%
            </div>
          </div>
        ) : (
          <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 10 }}>
            {open ? '▲' : '▼'}
          </span>
        )}
      </div>

      {/* Question */}
      <p style={{
        fontFamily:   'var(--f-body)',
        fontSize:     14,
        fontWeight:   400,
        color:        'var(--text)',
        lineHeight:   1.6,
        marginBottom: 16,
      }}>
        {pair.marketA.question}
      </p>

      {/* Price blocks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <PriceBlock market={pair.marketA} side={arb?.betSideA ?? 'yes'} highlight={!!arb} />
        <PriceBlock market={pair.marketB} side={arb?.betSideB ?? 'no'}  highlight={!!arb} />
      </div>

      {/* Arb instruction */}
      {arb && (
        <div style={{
          marginTop:    12,
          background:   'var(--lime-lo)',
          border:       '1px solid var(--lime-mid)',
          borderRadius: 8,
          padding:      '10px 16px',
          display:      'flex',
          justifyContent: 'space-between',
          alignItems:   'center',
          gap:          12,
        }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lime)', opacity: .85 }}>
            buy {arb.betSideA.toUpperCase()} on {plat(pair.marketA.platform).name} at {fmt(arb.priceA)}¢
            &nbsp;&amp;&nbsp;
            {arb.betSideB.toUpperCase()} on {plat(pair.marketB.platform).name} at {fmt(arb.priceB)}¢
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 14, color: 'var(--lime)', whiteSpace: 'nowrap' }}>
            +${arb.maxProfit.toFixed(2)} / $100
          </span>
        </div>
      )}

      {/* Expanded: question B + links */}
      {(open || arb) && (
        <div style={{ marginTop: 14 }}>
          {pair.marketA.question !== pair.marketB.question && (
            <p style={{
              fontFamily: 'var(--f-body)',
              fontSize: 12,
              color: 'var(--text3)',
              lineHeight: 1.5,
              marginBottom: 10,
              paddingLeft: 12,
              borderLeft: '2px solid var(--border2)',
            }}>
              {plat(pair.marketB.platform).name}: "{pair.marketB.question}"
            </p>
          )}
          <div style={{ display: 'flex', gap: 16 }} onClick={e => e.stopPropagation()}>
            {[pair.marketA, pair.marketB].map((m, i) => (
              <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" style={{
                fontFamily:     'var(--f-mono)',
                fontSize:       10,
                color:          plat(m.platform).color,
                textDecoration: 'none',
                opacity:        .7,
                letterSpacing:  '0.04em',
                borderBottom:   `1px solid ${plat(m.platform).color}40`,
                paddingBottom:  1,
              }}>
                open {plat(m.platform).name.toLowerCase()} ↗
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

// ── Stat block ────────────────────────────────────────────────────────────────
function Stat({ n, label, color }: { n: number | string; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        fontFamily:    'var(--f-brand)',
        fontSize:      28,
        fontWeight:    800,
        color:         color ?? 'var(--text)',
        lineHeight:    1,
        letterSpacing: '-0.02em',
      }}>{n}</span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  )
}

// Divider between stats
function Div() {
  return <div style={{ width: 1, height: 36, background: 'var(--border)', alignSelf: 'center' }} />
}

// ── Platform pair filter button ───────────────────────────────────────────────
type Filter = 'all' | 'arb' | string  // string = "platformA-platformB"

function filterLabel(f: string, arbN: number, total: number) {
  if (f === 'all') return `all pairs (${total})`
  if (f === 'arb') return `⚡ arb only (${arbN})`
  const [a, b] = f.split('-')
  return `${plat(a).label} × ${plat(b).label}`
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [result,   setResult]   = useState<ScanResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [filter,   setFilter]   = useState<Filter>('arb')
  const [lastScan, setLastScan] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/scan')
      if (!r.ok) throw new Error(`${r.status}`)
      const d: ScanResult = await r.json()
      setResult(d)
      setLastScan(new Date().toLocaleTimeString())
    } catch (e) { setError(String(e)) }
    finally     { setLoading(false) }
  }, [])

  useEffect(() => { scan() }, [scan])

  const pairs = result?.pairs ?? []
  const arbN  = pairs.filter(p => p.arbOpportunity).length
  const counts = (result as any)?.counts ?? {}

  // Derive unique platform pairs that actually appear in results
  const pairKeys = Array.from(new Set(
    pairs.map(p => `${p.marketA.platform}-${p.marketB.platform}`)
  ))

  const shown = (() => {
    if (filter === 'arb') return pairs.filter(p => p.arbOpportunity)
    if (filter === 'all') return pairs
    const [pa, pb] = filter.split('-')
    return pairs.filter(p =>
      (p.marketA.platform === pa && p.marketB.platform === pb) ||
      (p.marketA.platform === pb && p.marketB.platform === pa)
    )
  })()

  return (
    <div id="app" className={loading ? 'scanning' : ''}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(8,8,12,0.85)',
        backdropFilter: 'blur(12px)',
        padding: '0 32px',
        height: 58,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: 'var(--f-brand)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em' }}>
          arb<span style={{ color: 'var(--lime)' }}>.</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: loading ? 'var(--yellow)' : 'var(--lime)',
            }} className={loading ? '' : 'live-dot'} />
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text2)', letterSpacing: '0.08em' }}>
              {loading ? 'SCANNING' : lastScan ? lastScan : 'READY'}
            </span>
          </div>

          <button
            onClick={scan}
            disabled={loading}
            style={{
              fontFamily:    'var(--f-mono)',
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: '0.1em',
              background:    loading ? 'transparent' : 'var(--lime)',
              color:         loading ? 'var(--text3)' : '#000',
              border:        loading ? '1px solid var(--border2)' : '1px solid transparent',
              borderRadius:  6,
              padding:       '8px 18px',
              cursor:        loading ? 'not-allowed' : 'pointer',
              transition:    'all .15s',
            }}
          >
            {loading ? '· · ·' : 'SCAN'}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ padding: '56px 32px 40px', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{
          fontFamily:    'var(--f-brand)',
          fontSize:      'clamp(36px, 6vw, 64px)',
          fontWeight:    800,
          letterSpacing: '-0.04em',
          lineHeight:    1.05,
          color:         'var(--text)',
          marginBottom:  16,
        }}>
          find free money<br />
          <span style={{ color: 'var(--lime)' }}>in prediction markets.</span>
        </h1>
        <p style={{
          fontFamily: 'var(--f-body)',
          fontSize:   14,
          color:      'var(--text2)',
          maxWidth:   520,
          lineHeight: 1.7,
        }}>
          Scans Polymarket, Kalshi, Smarkets, and PredictIt — all real-money markets —
          and flags when the same event is priced differently across platforms.
        </p>

        {/* Platform pills */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          {(Object.entries(P) as [string, typeof P[PKey]][]).map(([key, cfg]) => (
            <span key={key} style={{
              fontFamily:    'var(--f-mono)',
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: '0.1em',
              background:    cfg.color + '15',
              color:         cfg.color,
              border:        `1px solid ${cfg.color}30`,
              borderRadius:  20,
              padding:       '4px 12px',
            }}>
              {cfg.name}
              {counts[key] !== undefined && (
                <span style={{ opacity: .6, marginLeft: 6 }}>{counts[key]}</span>
              )}
            </span>
          ))}
        </div>

        {/* Stats row */}
        {result && (
          <div className="pop-in" style={{
            marginTop:  36,
            display:    'flex',
            gap:        28,
            alignItems: 'flex-end',
            flexWrap:   'wrap',
          }}>
            <Stat n={pairs.length}  label="Pairs found" />
            <Div />
            <Stat n={arbN} label="Arb opportunities" color={arbN > 0 ? 'var(--lime)' : undefined} />
            <Div />
            <Stat n={Object.values(counts as Record<string,number>).reduce((a,b) => a+b, 0)} label="Markets scanned" color="var(--text2)" />
          </div>
        )}
      </section>

      {/* ── Filter bar ── */}
      <div style={{
        maxWidth:     900,
        margin:       '0 auto',
        padding:      '0 32px',
        marginBottom: 20,
        display:      'flex',
        alignItems:   'center',
        gap:          6,
        flexWrap:     'wrap',
      }}>
        {(['all', 'arb', ...pairKeys] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily:    'var(--f-mono)',
            fontSize:      10,
            fontWeight:    700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding:       '7px 14px',
            borderRadius:  6,
            border:        filter === f ? '1px solid var(--border2)' : '1px solid transparent',
            background:    filter === f ? 'var(--s2)' : 'transparent',
            color:         filter === f ? 'var(--text)' : 'var(--text3)',
            cursor:        'pointer',
            transition:    'all .15s',
          }}>
            {filterLabel(f, arbN, pairs.length)}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)' }}>
          {shown.length} results
        </span>
      </div>

      {/* ── Cards ── */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px 80px' }}>

        {error && (
          <div style={{
            background: '#ff456010', border: '1px solid #ff456030',
            borderRadius: 'var(--radius)', padding: '14px 18px',
            fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--red)',
            marginBottom: 16,
          }}>✕ {error}</div>
        )}

        {loading && !result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && !error && shown.length === 0 && result && (
          <div style={{
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            padding:        '80px 20px',
            textAlign:      'center',
            border:         '1px dashed var(--border)',
            borderRadius:   'var(--radius)',
          }}>
            <div style={{ fontFamily: 'var(--f-brand)', fontSize: 48, color: 'var(--text3)', marginBottom: 16 }}>◎</div>
            <div style={{ fontFamily: 'var(--f-brand)', fontSize: 20, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
              {filter === 'arb' ? 'no free money right now.' : 'no pairs found.'}
            </div>
            <p style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--text3)', maxWidth: 300, lineHeight: 1.6 }}>
              {filter === 'arb'
                ? 'Markets are pricing things efficiently for once. Check back soon.'
                : 'Hit scan to fetch the latest markets.'}
            </p>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')} style={{
                marginTop:   20,
                fontFamily:  'var(--f-mono)', fontSize: 10,
                fontWeight:  700, letterSpacing: '0.1em',
                background:  'transparent',
                color:       'var(--text2)',
                border:      '1px solid var(--border2)',
                borderRadius: 6, padding: '8px 16px',
                cursor:      'pointer',
              }}>
                VIEW ALL PAIRS →
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((pair, i) => (
            <PairCard key={pair.id} pair={pair} index={i} />
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      {shown.length > 0 && (
        <footer style={{
          borderTop:      '1px solid var(--border)',
          padding:        '20px 32px',
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          flexWrap:       'wrap',
          gap:            10,
        }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)' }}>
            arb. — not financial advice (obviously)
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)' }}>
            always verify prices before executing
          </span>
        </footer>
      )}
    </div>
  )
}
