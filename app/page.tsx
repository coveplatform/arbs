'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ScanResult, MarketPair, Market } from '@/lib/types'

// ── Platform config ────────────────────────────────────────────────────────
const P = {
  polymarket: { color: '#4f7eff', label: 'POLY', name: 'Polymarket' },
  kalshi:     { color: '#00d4aa', label: 'KALS', name: 'Kalshi'     },
  smarkets:   { color: '#e85d4a', label: 'SMKT', name: 'Smarkets'   },
  predictit:  { color: '#f5a623', label: 'PRDT', name: 'PredictIt'  },
  betfair:    { color: '#ffb300', label: 'BETF', name: 'Betfair'     },
} as const
type PKey = keyof typeof P
const plat = (k: string) => P[k as PKey] ?? { color: '#888', label: k.slice(0,4).toUpperCase(), name: k }

const fmt    = (p: number) => (p * 100).toFixed(1)
const fmtVol = (v: number) =>
  v >= 1e6 ? `$${(v/1e6).toFixed(1)}m` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}k` : v > 0 ? `$${Math.round(v)}` : ''

// ── Chip ──────────────────────────────────────────────────────────────────
function Chip({ platform }: { platform: string }) {
  const { color, label } = plat(platform)
  return (
    <span style={{
      fontFamily: 'var(--f-mono)', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.12em',
      background: color + '18', color,
      border: `1px solid ${color}30`,
      borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div className="skeleton" style={{ width: 44, height: 18 }} />
        <div className="skeleton" style={{ width: 44, height: 18 }} />
        <div className="skeleton" style={{ width: 70, height: 18, marginLeft: 'auto' }} />
      </div>
      <div className="skeleton" style={{ height: 14, width: '75%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '50%', marginBottom: 22 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="skeleton" style={{ height: 88 }} />
        <div className="skeleton" style={{ height: 88 }} />
      </div>
    </div>
  )
}

// ── Price block ───────────────────────────────────────────────────────────
function PriceBlock({ market, side, highlight }: { market: Market; side: 'yes' | 'no'; highlight: boolean }) {
  const p     = plat(market.platform)
  const price = side === 'yes' ? market.yesPrice : market.noPrice
  const vol   = fmtVol(market.volume)
  return (
    <div style={{
      background:   highlight ? p.color + '10' : 'var(--s2)',
      border:       `1px solid ${highlight ? p.color + '30' : 'var(--border)'}`,
      borderRadius: 10, padding: '14px 16px', transition: 'all .2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Chip platform={market.platform} />
        {highlight && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, fontWeight: 700, color: p.color, letterSpacing: '0.1em' }}>
            BUY ↗
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 32, fontWeight: 700,
          color: highlight ? p.color : 'var(--text)', lineHeight: 1,
        }}>{fmt(price)}</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text3)' }}>¢</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text2)', marginLeft: 2 }}>{side.toUpperCase()}</span>
      </div>
      {vol && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>{vol} vol</div>
      )}
    </div>
  )
}

// ── Pair card ─────────────────────────────────────────────────────────────
function PairCard({ pair, index }: { pair: MarketPair; index: number }) {
  const arb  = pair.arbOpportunity
  const [open, setOpen] = useState(false)

  return (
    <article
      className={arb ? 'arb-glow slide-up' : 'slide-up'}
      onClick={() => setOpen(o => !o)}
      style={{
        animationDelay: `${Math.min(index * 40, 400)}ms`,
        background:     arb ? 'linear-gradient(135deg, #0b1904 0%, #08080d 100%)' : 'var(--s1)',
        border:         `1px solid ${arb ? 'var(--lime-mid)' : 'var(--border)'}`,
        borderLeft:     arb ? '3px solid var(--lime)' : `1px solid var(--border)`,
        borderRadius:   'var(--radius)',
        padding:        '22px 24px',
        cursor:         'pointer',
        transition:     'border-color .2s, background .2s, transform .15s',
        position:       'relative',
        overflow:       'hidden',
      }}
      onMouseEnter={e => { if (!arb) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)' }}
      onMouseLeave={e => { if (!arb) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      {arb && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at top left, #b8ff5706 0%, transparent 55%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13, flexWrap: 'wrap' }}>
        <Chip platform={pair.marketA.platform} />
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>×</span>
        <Chip platform={pair.marketB.platform} />
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 2 }}>
          {(pair.similarity * 100).toFixed(0)}% match
        </span>
        {arb ? (
          <div style={{
            marginLeft: 'auto',
            background: 'var(--lime)', color: '#000',
            fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 12,
            borderRadius: 6, padding: '4px 11px', letterSpacing: '0.04em',
          }}>
            +{arb.profitPercent.toFixed(2)}%
          </div>
        ) : (
          <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
        )}
      </div>

      {/* Question */}
      <p style={{
        fontFamily: 'var(--f-body)', fontSize: 14.5, fontWeight: 400,
        color: 'var(--text)', lineHeight: 1.6, marginBottom: 16,
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
          marginTop: 12,
          background: 'var(--lime-lo)', border: '1px solid var(--lime-mid)',
          borderRadius: 8, padding: '11px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lime)', opacity: .85, lineHeight: 1.5 }}>
            buy {arb.betSideA.toUpperCase()} on {plat(pair.marketA.platform).name} at {fmt(arb.priceA)}¢
            &nbsp;&amp;&nbsp;
            {arb.betSideB.toUpperCase()} on {plat(pair.marketB.platform).name} at {fmt(arb.priceB)}¢
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontWeight: 700, fontSize: 15, color: 'var(--lime)', whiteSpace: 'nowrap' }}>
            +${arb.maxProfit.toFixed(2)} / $100
          </span>
        </div>
      )}

      {/* Expanded: question B + links */}
      {(open || arb) && (
        <div style={{ marginTop: 14 }}>
          {pair.marketA.question !== pair.marketB.question && (
            <p style={{
              fontFamily: 'var(--f-body)', fontSize: 12, color: 'var(--text3)',
              lineHeight: 1.5, marginBottom: 12, paddingLeft: 12,
              borderLeft: '2px solid var(--border2)',
            }}>
              {plat(pair.marketB.platform).name}: "{pair.marketB.question}"
            </p>
          )}
          <div style={{ display: 'flex', gap: 18 }} onClick={e => e.stopPropagation()}>
            {[pair.marketA, pair.marketB].map((m, i) => (
              <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" style={{
                fontFamily: 'var(--f-mono)', fontSize: 10,
                color: plat(m.platform).color, textDecoration: 'none',
                opacity: .7, letterSpacing: '0.04em',
                borderBottom: `1px solid ${plat(m.platform).color}35`, paddingBottom: 1,
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

type Filter = 'all' | 'arb' | string

// ── Animated counter ──────────────────────────────────────────────────────
function AnimatedNum({ value, color }: { value: number; color?: string }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(value)
  useEffect(() => {
    const from = ref.current
    ref.current = value
    if (from === value) return
    const steps = 20
    const delta = (value - from) / steps
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplay(Math.round(from + delta * i))
      if (i >= steps) { clearInterval(id); setDisplay(value) }
    }, 18)
    return () => clearInterval(id)
  }, [value])
  useEffect(() => { setDisplay(value) }, []) // eslint-disable-line
  return (
    <span style={{
      fontFamily: 'var(--f-brand)', fontSize: 'clamp(36px, 6vw, 64px)',
      fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1,
      color: color ?? 'var(--text)',
    }}>{display}</span>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function App() {
  const [result,   setResult]   = useState<ScanResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [filter,   setFilter]   = useState<Filter>('arb')
  const [lastScan, setLastScan] = useState<string | null>(null)
  const scannerRef = useRef<HTMLDivElement>(null)

  const scan = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/scan')
      if (!r.ok) throw new Error(`Scan failed (${r.status})`)
      const d: ScanResult = await r.json()
      setResult(d)
      setLastScan(new Date().toLocaleTimeString())
    } catch (e) { setError(String(e)) }
    finally     { setLoading(false) }
  }, [])

  useEffect(() => { scan() }, [scan])

  const pairs   = result?.pairs ?? []
  const arbN    = pairs.filter(p => p.arbOpportunity).length
  const counts  = (result as any)?.counts ?? {} as Record<string, number>
  const totalM  = Object.values(counts as Record<string,number>).reduce((a,b) => a+b, 0)

  const pairKeys = Array.from(new Set(pairs.map(p => `${p.marketA.platform}-${p.marketB.platform}`)))

  const shown = (() => {
    if (filter === 'arb') return pairs.filter(p => p.arbOpportunity)
    if (filter === 'all') return pairs
    const [pa, pb] = filter.split('-')
    return pairs.filter(p =>
      (p.marketA.platform === pa && p.marketB.platform === pb) ||
      (p.marketA.platform === pb && p.marketB.platform === pa)
    )
  })()

  const scrollToScanner = () => {
    scannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div id="app" className={loading ? 'scanning' : ''}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(6,6,10,0.88)',
        backdropFilter: 'blur(16px)',
        padding: '0 clamp(20px, 4vw, 48px)',
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: 'var(--f-brand)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.05em' }}>
          arb<span style={{ color: 'var(--lime)' }}>.</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--s1)', border: '1px solid var(--border)',
            borderRadius: 99, padding: '5px 12px',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: loading ? 'var(--yellow)' : 'var(--lime)',
            }} className={loading ? '' : 'live-dot'} />
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text2)', letterSpacing: '0.1em' }}>
              {loading ? 'SCANNING' : lastScan ? `LIVE · ${lastScan}` : 'READY'}
            </span>
          </div>

          <button
            onClick={scan} disabled={loading}
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em',
              background: loading ? 'var(--s2)' : 'var(--lime)',
              color:      loading ? 'var(--text3)' : '#000',
              border:     '1px solid transparent',
              borderRadius: 8, padding: '8px 20px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all .15s',
            }}
          >
            {loading ? '· · ·' : 'SCAN'}
          </button>

          <a
            href="#pricing"
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.08em', color: 'var(--text2)',
              textDecoration: 'none', padding: '8px 14px',
              borderRadius: 8, border: '1px solid var(--border)',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
          >
            PRICING
          </a>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{
        padding: 'clamp(60px, 10vw, 110px) clamp(20px, 4vw, 48px) clamp(50px, 8vw, 90px)',
        maxWidth: 'var(--max-w)', margin: '0 auto',
        textAlign: 'center', position: 'relative',
      }}>
        {/* Glow blob behind hero */}
        <div style={{
          position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 600, height: 300,
          background: 'radial-gradient(ellipse, #b8ff5708 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: 'var(--lime-lo)', border: '1px solid var(--lime-mid)',
          borderRadius: 99, padding: '5px 14px', marginBottom: 28,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)' }} className="live-dot" />
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, fontWeight: 700, color: 'var(--lime)', letterSpacing: '0.1em' }}>
            {arbN > 0 ? `${arbN} LIVE ARB OPPORTUNITIES` : 'REAL-TIME SCANNER ACTIVE'}
          </span>
        </div>

        <h1 style={{
          fontFamily: 'var(--f-brand)',
          fontSize: 'clamp(38px, 7vw, 80px)',
          fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05,
          color: 'var(--text)', marginBottom: 20,
        }}>
          Beat prediction markets<br />
          <span style={{ color: 'var(--lime)' }}>with guaranteed profit.</span>
        </h1>

        <p style={{
          fontFamily: 'var(--f-body)', fontSize: 'clamp(14px, 2vw, 17px)',
          color: 'var(--text2)', maxWidth: 560, margin: '0 auto 36px',
          lineHeight: 1.75,
        }}>
          arb. scans Polymarket, Kalshi, Smarkets, and PredictIt simultaneously — flagging
          when the same question is priced differently so you can lock in risk-free profit.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => { scan(); setTimeout(scrollToScanner, 100) }}
            disabled={loading}
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.08em',
              background: 'var(--lime)', color: '#000',
              border: 'none', borderRadius: 10, padding: '13px 28px',
              cursor: 'pointer', transition: 'opacity .15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '.88' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          >
            {loading ? 'SCANNING...' : '⚡ SCAN NOW — FREE'}
          </button>
          <a
            href="#pricing"
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.08em', color: 'var(--text)',
              textDecoration: 'none',
              background: 'transparent', border: '1px solid var(--border2)',
              borderRadius: 10, padding: '13px 28px',
              transition: 'border-color .15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text3)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)' }}
          >
            GET FULL ACCESS →
          </a>
        </div>

        {/* Live stats */}
        {result && (
          <div className="pop-in" style={{
            display: 'flex', justifyContent: 'center', gap: 'clamp(24px, 5vw, 60px)',
            marginTop: 56, flexWrap: 'wrap',
          }}>
            {[
              { value: totalM,      label: 'markets scanned',   color: undefined },
              { value: pairs.length,label: 'pairs matched',     color: undefined },
              { value: arbN,        label: 'arb opportunities', color: arbN > 0 ? 'var(--lime)' : undefined },
            ].map(({ value, label, color }, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <AnimatedNum value={value} color={color} />
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)',
                  letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 6,
                }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Platform strip ───────────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        padding: '18px clamp(20px, 4vw, 48px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        gap: 'clamp(10px, 2vw, 32px)', flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.1em', marginRight: 8 }}>SCANNING</span>
        {(Object.entries(P) as [string, typeof P[PKey]][]).filter(([k]) => k !== 'betfair').map(([key, cfg]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color }} />
            <span style={{
              fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', color: cfg.color,
            }}>
              {cfg.name}
              {counts[key] !== undefined && counts[key] > 0 && (
                <span style={{ opacity: .5, fontWeight: 400, marginLeft: 5 }}>{counts[key]}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* ── Scanner / Live Results ────────────────────────────────────────── */}
      <div ref={scannerRef} style={{
        maxWidth: 'var(--max-w)', margin: '0 auto',
        padding: 'clamp(40px, 6vw, 70px) clamp(20px, 4vw, 48px) 0',
      }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            fontFamily: 'var(--f-brand)', fontSize: 'clamp(20px, 3vw, 28px)',
            fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 6,
          }}>Live Scanner</h2>
          <p style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--text2)' }}>
            {loading ? 'Fetching markets and running AI matching...'
              : lastScan ? `Last scanned at ${lastScan}`
              : 'Hit scan to fetch the latest markets.'}
          </p>
        </div>

        {/* Filter bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          marginBottom: 16, flexWrap: 'wrap',
        }}>
          {(['all', 'arb', ...pairKeys] as Filter[]).map(f => {
            const isActive = filter === f
            const label = f === 'all' ? `All pairs (${pairs.length})`
              : f === 'arb' ? `⚡ Arb only (${arbN})`
              : (() => { const [a, b] = f.split('-'); return `${plat(a).label} × ${plat(b).label}` })()
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontFamily: 'var(--f-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '7px 13px', borderRadius: 7,
                border: isActive ? '1px solid var(--border2)' : '1px solid transparent',
                background: isActive ? 'var(--s2)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text3)',
                cursor: 'pointer', transition: 'all .15s',
              }}>{label}</button>
            )
          })}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)' }}>
            {shown.length} results
          </span>
        </div>
      </div>

      {/* Cards */}
      <main style={{
        maxWidth: 'var(--max-w)', margin: '0 auto',
        padding: '0 clamp(20px, 4vw, 48px) 60px',
      }}>
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
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '72px 20px', textAlign: 'center',
            border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
          }}>
            <div style={{ fontFamily: 'var(--f-brand)', fontSize: 44, color: 'var(--text3)', marginBottom: 14 }}>◎</div>
            <div style={{ fontFamily: 'var(--f-brand)', fontSize: 20, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
              {filter === 'arb' ? 'No arbs right now.' : 'No pairs found.'}
            </div>
            <p style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--text3)', maxWidth: 300, lineHeight: 1.6 }}>
              {filter === 'arb'
                ? 'Markets are pricing efficiently. Check back in a few minutes.'
                : 'Hit scan to fetch the latest markets.'}
            </p>
            {filter !== 'all' && (
              <button onClick={() => setFilter('all')} style={{
                marginTop: 20, fontFamily: 'var(--f-mono)', fontSize: 10,
                fontWeight: 700, letterSpacing: '0.1em',
                background: 'transparent', color: 'var(--text2)',
                border: '1px solid var(--border2)', borderRadius: 7, padding: '9px 18px',
                cursor: 'pointer',
              }}>
                VIEW ALL PAIRS →
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((pair, i) => <PairCard key={pair.id} pair={pair} index={i} />)}
        </div>
      </main>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section style={{
        borderTop: '1px solid var(--border)',
        padding: 'clamp(60px, 8vw, 100px) clamp(20px, 4vw, 48px)',
        maxWidth: 'var(--max-w)', margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.16em', color: 'var(--lime)', marginBottom: 14,
            textTransform: 'uppercase',
          }}>How it works</div>
          <h2 style={{
            fontFamily: 'var(--f-brand)', fontSize: 'clamp(26px, 4vw, 42px)',
            fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)',
          }}>Three steps to free money.</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {[
            {
              n: '01', title: 'We scan 4 platforms',
              body: 'Every time you hit scan, arb. fetches live markets from Polymarket, Kalshi, Smarkets, and PredictIt — hundreds of markets in seconds.',
              accent: '#4f7eff',
            },
            {
              n: '02', title: 'AI finds matching questions',
              body: 'GPT-4 reads both market lists and identifies pairs asking about the same real-world outcome — even when the wording differs across platforms.',
              accent: '#00d4aa',
            },
            {
              n: '03', title: 'Lock in guaranteed profit',
              body: 'When the combined cost of YES + NO is under $1 after fees, you\'ve found an arb. Buy both sides and collect the spread — regardless of the outcome.',
              accent: 'var(--lime)',
            },
          ].map(({ n, title, body, accent }) => (
            <div key={n} style={{
              background: 'var(--s1)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '28px 26px',
              transition: 'border-color .2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
            >
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: 28, fontWeight: 700,
                color: accent, letterSpacing: '-0.02em', marginBottom: 16, lineHeight: 1,
              }}>{n}</div>
              <h3 style={{
                fontFamily: 'var(--f-brand)', fontSize: 18, fontWeight: 700,
                color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 10,
              }}>{title}</h3>
              <p style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.75 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section id="pricing" style={{
        borderTop: '1px solid var(--border)',
        padding: 'clamp(60px, 8vw, 100px) clamp(20px, 4vw, 48px)',
        maxWidth: 'var(--max-w)', margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.16em', color: 'var(--lime)', marginBottom: 14,
            textTransform: 'uppercase',
          }}>Pricing</div>
          <h2 style={{
            fontFamily: 'var(--f-brand)', fontSize: 'clamp(26px, 4vw, 42px)',
            fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)',
          }}>One plan. Everything included.</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 800, margin: '0 auto' }}>
          {/* Free tier */}
          <div style={{
            background: 'var(--s1)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '36px 32px',
          }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', marginBottom: 20 }}>FREE</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--f-brand)', fontSize: 48, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>$0</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text3)' }}>/mo</span>
            </div>
            <p style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 28 }}>
              Try the scanner now. No account needed.
            </p>
            {['Scan on demand', '4 real-money platforms', 'AI market matching', 'Profit calculator'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                <span style={{ color: 'var(--text3)', fontSize: 14 }}>○</span>
                <span style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--text2)' }}>{f}</span>
              </div>
            ))}
            <button
              onClick={() => { scan(); scrollToScanner() }}
              style={{
                width: '100%', marginTop: 28,
                fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.08em', padding: '13px',
                background: 'transparent', color: 'var(--text2)',
                border: '1px solid var(--border2)', borderRadius: 9, cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
            >
              SCAN NOW →
            </button>
          </div>

          {/* Pro tier */}
          <div style={{
            background: 'linear-gradient(135deg, #0d1a05 0%, #0a0f0a 100%)',
            border: '1px solid var(--lime-mid)',
            borderRadius: 'var(--radius)', padding: '36px 32px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, right: 0,
              background: 'var(--lime)', color: '#000',
              fontFamily: 'var(--f-mono)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.1em', padding: '5px 14px',
              borderBottomLeftRadius: 9,
            }}>POPULAR</div>

            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--lime)', letterSpacing: '0.1em', marginBottom: 20 }}>PRO</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--f-brand)', fontSize: 48, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>$49</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--text3)' }}>/mo</span>
            </div>
            <p style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 28 }}>
              Full access. Scan as often as you want. Cancel anytime.
            </p>
            {[
              'Everything in Free',
              'Auto-refresh every 5 minutes',
              'Email alerts for new arbs',
              'Historical arb tracking',
              'Export to CSV',
              'Priority support',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                <span style={{ color: 'var(--lime)', fontSize: 14 }}>✓</span>
                <span style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--text)' }}>{f}</span>
              </div>
            ))}
            <button
              style={{
                width: '100%', marginTop: 28,
                fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.08em', padding: '14px',
                background: 'var(--lime)', color: '#000',
                border: 'none', borderRadius: 9, cursor: 'pointer',
                transition: 'opacity .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '.88' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
              onClick={() => alert('Payment coming soon — drop your email at arb@example.com to join the waitlist.')}
            >
              GET STARTED →
            </button>
          </div>
        </div>

        <p style={{
          textAlign: 'center', marginTop: 24,
          fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em',
        }}>
          No credit card required to try. Cancel anytime.
        </p>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '24px clamp(20px, 4vw, 48px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10,
      }}>
        <span style={{ fontFamily: 'var(--f-brand)', fontSize: 18, fontWeight: 800, letterSpacing: '-0.05em' }}>
          arb<span style={{ color: 'var(--lime)' }}>.</span>
        </span>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)' }}>Not financial advice.</span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)' }}>Verify prices before executing.</span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text3)' }}>© 2025 arb.</span>
        </div>
      </footer>
    </div>
  )
}
