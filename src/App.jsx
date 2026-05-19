import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom'

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg:     '#071e1e',
  surf:   '#071818',
  raised: '#0a2020',
  border: '#1e4040',
  teal:   '#14b8a6',
  cyan:   '#06b6d4',
  muted:  '#7ababa',
  faint:  '#0d2424',
  green:  '#10b981',
  amber:  '#f59e0b',
  red:    '#ef4444',
}

// Alpend brand "A" mark — shared across all Alpend products
const A_PATH = "M218.1 127.505C243.003 175.773 264.789 218.617 275.951 241.154L259.838 286.11C252.336 272.015 234.966 238.409 215.475 200.214C190.205 150.697 168.83 109.277 167.971 108.163C167.114 107.057 164.039 110.789 161.139 116.456C146.006 146.026 102.283 230.597 86.4014 261.016L72.8496 286.969L57.0283 242.826C68.2312 219.761 92.1891 172.554 121.127 116.684L147.211 66.3262L141.502 55.0791C138.361 48.8956 134.89 42.4984 133.786 40.8652C132.356 38.7504 124.701 51.7136 107.201 85.8838C74.7424 149.262 55.1302 187.133 44.2686 207.227L28.3945 162.938L36.1729 147.796C48.139 124.5 70.1264 81.7154 85.0312 52.7188L112.132 0H152.316L218.1 127.505ZM202.031 0.5C212.606 0.123352 221.474 0.123477 221.74 0.5C222.019 0.907291 244.179 43.7151 270.996 95.6572L304.701 160.939L288.181 207.033C281.321 193.634 271.947 175.291 261.69 155.195C241.07 114.797 214.885 63.6177 203.5 41.4639L182.8 1.18457L202.031 0.5ZM62.3809 0.0302734C81.1695 0.00184335 81.8411 0.180335 79.7129 4.6582C78.4927 7.22439 64.9022 33.6139 49.5098 63.3008C37.5348 86.3983 24.1965 112.218 15.958 128.24L0 83.7139C3.78962 76.2368 7.95531 68.0637 12.3086 59.5762L42.834 0.0634766L62.3809 0.0302734ZM271.617 0.101562L291.25 0.203125L321.775 59.8125C325.733 67.5406 329.519 75.0308 332.998 81.9902L316.646 127.616C300.783 96.9341 277.441 51.0705 260.038 16.1592L251.981 0L271.617 0.101562Z"

// ─── PROTOCOL CONFIG ──────────────────────────────────────────────────────────
const CC_PRICE      = 0.15   // Canton Coin oracle price in USD
const MAX_LTV       = 80     // % — max borrow ratio
const LIQ_LTV       = 82     // % — liquidation threshold
const MINT_FEE_PCT  = 0.005  // 0.5% one-time origination fee (added to debt, not deducted from payout)
const INTEREST_RATE = 5.0    // % annual interest (accrues on outstanding debt)
const LIQ_RESERVE   = 10     // ONE held as safety reserve (refundable on close)
const MIN_DEBT      = 100    // minimum ONE position

// ─── RISK ENGINE ──────────────────────────────────────────────────────────────
function computeRisk(ccAmount, oneDebt) {
  const col = Number(ccAmount) || 0
  const debt = Number(oneDebt) || 0
  if (col <= 0) return null
  const collateralUSD = col * CC_PRICE
  const ltv           = debt > 0 ? (debt / collateralUSD) * 100 : 0
  const liqPrice      = debt > 0 ? debt / (col * (LIQ_LTV / 100)) : 0
  const priceDrop     = liqPrice > 0 ? ((CC_PRICE - liqPrice) / CC_PRICE) * 100 : 100
  const maxMint       = Math.max(0, Math.floor(collateralUSD * (MAX_LTV / 100) - LIQ_RESERVE))
  const available     = Math.max(0, maxMint - debt)
  const healthRatio   = LIQ_LTV > 0 ? ltv / LIQ_LTV : 0   // 0 = empty, ≥1 = liquidated
  const status        = healthRatio > 0.88 ? 'Danger'
                      : healthRatio > 0.68 ? 'Moderate'
                      : 'Healthy'
  const cr            = debt > 0 ? (collateralUSD / debt) * 100 : Infinity
  return { collateralUSD, ltv, liqPrice, priceDrop, maxMint, available, healthRatio, status, cr }
}

function riskColor(status) {
  if (status === 'Healthy')  return C.green
  if (status === 'Moderate') return C.amber
  return C.red
}
function riskBg(status) {
  if (status === 'Healthy')  return 'rgba(16,185,129,0.1)'
  if (status === 'Moderate') return 'rgba(245,158,11,0.1)'
  return 'rgba(239,68,68,0.1)'
}
function riskEmoji(status) {
  if (status === 'Healthy')  return '✓'
  if (status === 'Moderate') return '⚠'
  return '!'
}

// ─── MOCK DATA ─────────────────────────────────────────────────────────────────
const INITIAL_VAULT = null  // default: no vault — user must open one
const MOCK_VAULT    = { id: 1, ccAmount: 30000, oneDebt: 2800 }  // used after vault is opened

const PROTO = {
  tvl: '$4.25M', supply: '2,184,000', vaults: 347,
  ccPrice: `$${CC_PRICE.toFixed(2)}`, poolAPY: '21.26%',
}

// ─── ICONS ────────────────────────────────────────────────────────────────────
function IcoDash()  { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1.5" y="1.5" width="5" height="5" rx="1"/><rect x="8.5" y="1.5" width="5" height="5" rx="1"/><rect x="1.5" y="8.5" width="5" height="5" rx="1"/><rect x="8.5" y="8.5" width="5" height="5" rx="1"/></svg> }
function IcoMint()  { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7.5" cy="7.5" r="6"/><path d="M7.5 4.5v6M4.5 7.5h6"/></svg> }
function IcoEarn()  { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 11 L5 7 L8.5 9 L13 3"/><polyline points="10,3 13,3 13,6"/></svg> }
function IcoToken() { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7.5" cy="7.5" r="6"/><path d="M5.5 7.5h4M7.5 5.5v4"/></svg> }
function IcoInfo()  { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="5"/><path d="M6 5.5v3M6 4h.01"/></svg> }
function IcoArrow() { return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8.5L8.5 2.5M8.5 2.5H3.5M8.5 2.5V7.5"/></svg> }
function IcoBack()  { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11.5L4 7l5-4.5"/></svg> }
function IcoClose() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg> }
function IcoCC()    { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1.5" y="4" width="15" height="10" rx="2"/><path d="M1.5 7.5h15"/><path d="M5 11.5h2M10 11.5h3"/></svg> }
function IcoPlus()  { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 4v10M4 9h10"/></svg> }
function IcoChevDown() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 4.5L6 7.5L9 4.5"/></svg> }
function IcoChevUp()   { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7.5L6 4.5L9 7.5"/></svg> }
function IcoShield()   { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1.5l5 2v4c0 2.5-2 4.5-5 5.5C4 12 2 10 2 7.5v-4l5-2z"/></svg> }
function IcoSpark()    { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.4 1.4M9.6 9.6L11 11M3 11l1.4-1.4M9.6 4.4L11 3"/><circle cx="7" cy="7" r="2.5"/></svg> }
function IcoWallet()   { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3.5" width="13" height="9" rx="1.5"/><path d="M1 6.5h13"/><circle cx="11" cy="9.5" r="1" fill="currentColor" stroke="none"/></svg> }
function IcoSpinner({ size = 22 }) { return <svg width={size} height={size} viewBox="0 0 15 15" fill="none" style={{ animation: 'a-spin 0.75s linear infinite' }}><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/><path d="M13 7.5a5.5 5.5 0 0 0-5.5-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> }

// ─── FOOTER ───────────────────────────────────────────────────────────────────
const FOOTER_SOCIALS = [
  { label: 'Website',  href: 'https://alpend.com',          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
  { label: 'Docs',     href: 'https://docs.alpend.com',     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg> },
  { label: 'X',        href: 'https://x.com/AlpendMarket',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
  { label: 'Telegram', href: 'https://t.me/AlpendDesk',     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> },
  { label: 'GitHub',   href: 'https://github.com/alpend',   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg> },
]
const FOOTER_LEGAL = ['Terms of Use', 'Privacy Policy', 'Disclaimer', 'Audit']
function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #0d2a2a', background: '#071e1e' }}>
      <div style={{ padding: '14px 56px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#4a7878', whiteSpace: 'nowrap' }}>© 2026 Alpend. All rights reserved.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {FOOTER_LEGAL.map(l => (
            <a key={l} href="#" style={{ fontSize: 11, color: '#4a7878', textDecoration: 'none' }}
              onMouseEnter={e => e.target.style.color = '#8ecece'}
              onMouseLeave={e => e.target.style.color = '#4a7878'}>{l}</a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {FOOTER_SOCIALS.map(s => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}
              style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: '#5a8888', textDecoration: 'none', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#a8d8d8'; e.currentTarget.style.background = '#0d2828' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#5a8888'; e.currentTarget.style.background = 'transparent' }}>
              {s.icon}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
function EmptyState({ icon, title, hint, compact = false }) {
  return (
    <div style={{ textAlign: 'center', padding: compact ? '20px 16px' : '36px 16px' }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: '#0a2020', border: '1px solid #163535', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: '#2a5050' }}>
        {icon}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#3a6060', marginBottom: hint ? 4 : 0 }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#1e3838', marginTop: 3, maxWidth: 220, margin: '3px auto 0' }}>{hint}</div>}
    </div>
  )
}

function IcoSend()     { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L6.5 8.5M13 2L9 13l-2.5-4.5L2 6l11-4z"/></svg> }
function IcoReceive()  { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M7.5 2v8M4.5 7l3 3 3-3"/><path d="M2 12h11"/></svg> }
function IcoSwapH()    { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5h11M10 2l3 3-3 3"/><path d="M13 10H2M5 7l-3 3 3 3"/></svg> }
function IcoCopy()     { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="4.5" width="8" height="8" rx="1"/><path d="M4.5 9.5H2.5a1 1 0 01-1-1v-7a1 1 0 011-1h7a1 1 0 011 1v2"/></svg> }
function IcoQR()       { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="5" height="5" rx="0.5"/><rect x="9" y="1" width="5" height="5" rx="0.5"/><rect x="1" y="9" width="5" height="5" rx="0.5"/><rect x="2.5" y="2.5" width="2" height="2" fill="currentColor" stroke="none"/><rect x="10.5" y="2.5" width="2" height="2" fill="currentColor" stroke="none"/><rect x="2.5" y="10.5" width="2" height="2" fill="currentColor" stroke="none"/><path d="M9 9h2v2H9zM11 11h2v2h-2zM9 11h2"/></svg> }
function IcoLoop()     { return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2a7 7 0 100 14A7 7 0 009 2z"/><path d="M6 9l2 2 4-4"/></svg> }

// CC coin badge — uses real cccoin.svg asset
function CCCoinBadge({ size = 28 }) {
  return <img src="/cccoin.svg" width={size} height={size} alt="CC" style={{ display: 'block', borderRadius: '50%' }} />
}

// yONE vault receipt token badge
function BONEBadge({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <defs>
        <linearGradient id="boneGrad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <circle cx="14" cy="14" r="14" fill="url(#boneGrad)" fillOpacity="0.15" />
      <circle cx="14" cy="14" r="13" stroke="url(#boneGrad)" strokeWidth="1" strokeOpacity="0.5" />
      <text x="14" y="15.5" textAnchor="middle" fill="#10b981"
        fontSize="7" fontWeight="800" fontFamily="Inter, system-ui, sans-serif" letterSpacing="-0.3">yONE</text>
    </svg>
  )
}

function ONEMark({ size = 28 }) {
  return <img src="/one-token.webp" width={size} height={size} alt="ONE" style={{ display: 'block', borderRadius: '50%' }} />
}

// ─── PRIMITIVE COMPONENTS ─────────────────────────────────────────────────────

function Card({ children, style = {}, className = '', ...rest }) {
  return (
    <div
      className={className}
      style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 16, ...style }}
      {...rest}
    >{children}</div>
  )
}

function Tip({ text, children, placement = 'up' }) {
  const tipPos = placement === 'down'
    ? { top: 'calc(100% + 8px)', bottom: 'auto' }
    : {}
  return (
    <span className="tip-wrap" style={{ color: C.muted }}>
      {children || <IcoInfo />}
      <span className="tip" style={tipPos}>{text}</span>
    </span>
  )
}

function Btn({ label, onClick, disabled, full, color = 'primary', size = 'md', icon }) {
  const [hov, setHov] = useState(false)
  const grad = `linear-gradient(135deg, ${C.teal}, ${C.cyan})`
  const styles = {
    primary: {
      background: disabled ? C.faint : hov ? `linear-gradient(135deg, #10d9c5, #22d3ee)` : grad,
      color: disabled ? C.muted : C.bg,
      boxShadow: (!disabled && hov) ? '0 4px 20px rgba(20,184,166,0.35)' : 'none',
    },
    ghost: {
      background: hov ? C.raised : 'transparent',
      border: `1px solid ${hov ? C.teal + '55' : C.border}`,
      color: hov ? '#fff' : C.muted,
    },
    danger: {
      background: hov ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)',
      border: `1px solid rgba(239,68,68,${hov ? 0.4 : 0.2})`,
      color: '#f87171',
    },
    success: {
      background: disabled ? C.faint : hov ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.15)',
      border: `1px solid rgba(16,185,129,${hov ? 0.5 : 0.25})`,
      color: disabled ? C.muted : C.green,
    },
  }
  const pads = size === 'sm' ? '8px 14px' : size === 'lg' ? '15px 28px' : '12px 22px'
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: full ? '100%' : undefined, padding: pads,
        borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700, fontSize: size === 'sm' ? 12 : 14, letterSpacing: '-0.01em',
        transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
        ...styles[color],
      }}
    >
      {label}
      {icon && icon}
    </button>
  )
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: C.raised, borderRadius: 10, padding: 4 }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          flex: 1, padding: '9px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
          fontWeight: active === t ? 700 : 500, fontSize: 13,
          background: active === t ? C.surf : 'transparent',
          color: active === t ? '#fff' : C.muted,
          boxShadow: active === t ? '0 1px 6px rgba(0,0,0,0.3)' : 'none',
          transition: 'all 0.15s ease',
          borderBottom: active === t ? `2px solid ${C.teal}` : '2px solid transparent',
        }}>{t}</button>
      ))}
    </div>
  )
}

function Row({ label, value, tip, highlight, mono, sub, noBorder }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: noBorder ? 'none' : `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label} {tip && <Tip text={tip} />}
      </span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: highlight || '#fff', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

function Collapse({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 20px', background: C.surf, border: 'none', cursor: 'pointer',
        color: '#fff', fontWeight: 600, fontSize: 13,
      }}>
        {icon && <span style={{ color: C.teal }}>{icon}</span>}
        <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
        <span style={{ color: C.muted }}>{open ? <IcoChevUp /> : <IcoChevDown />}</span>
      </button>
      {open && <div style={{ padding: '2px 20px 16px', background: C.surf }}>{children}</div>}
    </div>
  )
}

// ─── AMOUNT INPUT ─────────────────────────────────────────────────────────────

function AmountInput({ label, value, onChange, max, unit, usdValue, hint, subHint }) {
  const pct = max > 0 ? Math.min((Number(value) / max) * 100, 100) : 0
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: C.muted }}>{hint}</span>}
      </div>
      <div style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', transition: 'border-color 0.15s' }}
        onFocus={() => {}} onBlur={() => {}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="0"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', minWidth: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.faint, borderRadius: 8, padding: '7px 12px', whiteSpace: 'nowrap' }}>
            {unit === 'CC' ? <CCCoinBadge size={20} /> : unit === 'yONE' ? <BONEBadge size={20} /> : <ONEMark size={20} />}
            <span style={{ fontSize: 13, fontWeight: 700, color: unit === 'CC' ? C.teal : unit === 'yONE' ? C.green : C.cyan }}>{unit}</span>
          </div>
        </div>
        {usdValue !== undefined && (
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>≈ {usdValue}</div>
        )}
      </div>
      {max > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <div style={{ height: 6, background: C.faint, borderRadius: 3 }} />
            <div style={{ position: 'absolute', top: 0, left: 0, height: 6, width: `${pct}%`, background: `linear-gradient(90deg, ${C.teal}, ${C.cyan})`, borderRadius: 3, transition: 'width 0.15s' }} />
            <input type="range" min="0" max={max} step={max > 100 ? 10 : 0.1}
              value={Number(value) || 0} onChange={e => onChange(e.target.value)}
              style={{ position: 'absolute', top: -6, left: 0, width: '100%', height: 18, opacity: 0, cursor: 'pointer', zIndex: 1 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.muted }}>{subHint || `Balance: ${Number(max).toLocaleString()} ${unit}`}</span>
            <button onClick={() => onChange(String(max))}
              style={{ fontSize: 11, fontWeight: 700, color: C.teal, background: 'none', border: 'none', cursor: 'pointer', padding: 0, letterSpacing: '0.05em' }}>
              MAX
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── RISK PANEL ───────────────────────────────────────────────────────────────

function RiskPanel({ risk, prevRisk, compact = false }) {
  if (!risk) return (
    <div style={{ textAlign: 'center', padding: '24px 16px', color: C.muted, fontSize: 13 }}>
      Enter a deposit amount to see your risk profile.
    </div>
  )

  const { ltv, liqPrice, priceDrop, status, cr, healthRatio } = risk
  const color = riskColor(status)
  const pct   = Math.min(healthRatio * 100, 100)

  // LTV bar zones: 0-60% green, 60-74% amber, 74-82% red
  const greenW  = Math.min(pct, (60 / LIQ_LTV) * 100)
  const amberW  = Math.max(0, Math.min(pct, (74 / LIQ_LTV) * 100) - (60 / LIQ_LTV) * 100)
  const redW    = Math.max(0, pct - (74 / LIQ_LTV) * 100)

  return (
    <div>
      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IcoShield />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Position Health</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 100, background: riskBg(status), border: `1px solid ${color}44` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 6px ${color}` }} />
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{status}</span>
        </div>
      </div>

      {/* LTV segmented bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Loan-to-Value (LTV)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {prevRisk && Math.abs(prevRisk.ltv - ltv) > 0.1 && (
              <span style={{ fontSize: 12, color: C.muted, textDecoration: 'line-through' }}>{prevRisk.ltv.toFixed(1)}%</span>
            )}
            <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'JetBrains Mono, monospace' }}>{ltv.toFixed(1)}%</span>
          </div>
        </div>
        {/* Segmented bar */}
        <div style={{ height: 10, borderRadius: 5, background: C.faint, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${greenW}%`, background: '#10b981', transition: 'width 0.3s' }} />
          <div style={{ width: `${amberW}%`, background: '#f59e0b', transition: 'width 0.3s' }} />
          <div style={{ width: `${redW}%`,   background: '#ef4444', transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 12, color: C.muted }}>
          <span style={{ color: '#10b981' }}>Safe 0%</span>
          <span style={{ color: '#f59e0b' }}>Moderate 60%</span>
          <span style={{ color: '#ef4444' }}>Liq. {LIQ_LTV}%</span>
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: compact ? 0 : 4 }}>
        <MetricBox
          label="Liq. Price"
          value={liqPrice > 0 ? `$${liqPrice.toFixed(3)}` : '—'}
          sub={`Now: $${CC_PRICE.toFixed(2)}`}
          color={color}
          tip="CC price that triggers liquidation"
        />
        <MetricBox
          label="Price Buffer"
          value={priceDrop < 100 ? `${priceDrop.toFixed(1)}%` : '—'}
          sub="CC can fall before liq."
          color={priceDrop > 35 ? C.green : priceDrop > 20 ? C.amber : C.red}
          tip="How much the CC price can fall before your vault becomes eligible for liquidation"
        />
        {!compact && <>
          <MetricBox
            label="LTV Margin"
            value={ltv > 0 ? `${(LIQ_LTV - ltv).toFixed(1)} pts` : '—'}
            sub={`Current ${ltv.toFixed(1)}% · liq. at ${LIQ_LTV}%`}
            color={(LIQ_LTV - ltv) > 18 ? C.green : (LIQ_LTV - ltv) > 8 ? C.amber : C.red}
            tip={`Your LTV is ${ltv.toFixed(1)}%. Liquidation triggers at ${LIQ_LTV}%. You have ${(LIQ_LTV - ltv).toFixed(1)} percentage points of room before your vault can be liquidated.`}
          />
          <MetricBox
            label="Available to Borrow"
            value={`${risk.available.toLocaleString()} ONE`}
            sub={`At ${MAX_LTV}% LTV`}
            color={C.teal}
            tip="Additional ONE you can borrow against your current collateral"
          />
        </>}
      </div>
    </div>
  )
}

function MetricBox({ label, value, sub, color, tip }) {
  return (
    <div style={{ background: C.raised, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
        {tip && <Tip text={tip} />}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || '#fff', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ─── NAV ──────────────────────────────────────────────────────────────────────

function Nav({ connected, onConnect, onLogout }) {
  const loc = useLocation()
  const links = [
    { to: '/vault',   label: 'Vault'  },
    { to: '/token',   label: 'ONE'    },
    { to: '/explore', label: 'Wallet' },
  ]
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px',
      background: '#071e1e',
      borderBottom: '1px solid #0d2424',
    }}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <img src="/one-logo.webp" alt="ONE" style={{ height: 30, width: 'auto', display: 'block' }} />
      </Link>

      <div />

      {connected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 8, background: '#0a2020', border: '1px solid #1e4040', cursor: 'default' }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#5a9090" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="5.5" width="9" height="6" rx="1.5"/><path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', color: '#8ecece', letterSpacing: '0.03em' }}>{MOCK_ADDR_SHORT}</span>
          </div>
          <button
            onClick={onLogout}
            style={{ color: '#7ababa', border: '1px solid #1e4040', background: 'transparent', fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#c0e8e8'; e.currentTarget.style.borderColor = '#2a5a5a' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#7ababa'; e.currentTarget.style.borderColor = '#1e4040' }}
          >Logout</button>
        </div>
      ) : (
        <button onClick={onConnect} style={{
          padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: '#14b8a6', color: '#071e1e', fontWeight: 600, fontSize: 13,
          letterSpacing: '0.02em', transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#0d9488'}
          onMouseLeave={e => e.currentTarget.style.background = '#14b8a6'}
        >Connect Wallet</button>
      )}
    </nav>
  )
}

// ─── STATS TICKER ─────────────────────────────────────────────────────────────

function TickerItem({ label, value, color, tip, borderLeft }) {
  return (
    <div style={{ flex: '0 0 auto', padding: '10px 24px', borderLeft: borderLeft ? `1px solid ${C.border}` : 'none', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}<Tip text={tip} placement="down" />
      </span>
      <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.02em' }}>{value}</span>
    </div>
  )
}

function StatsTicker() {
  return (
    <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'stretch', background: C.surf, borderBottom: `1px solid ${C.border}` }}>
      {/* Left group — protocol volume stats */}
      <div style={{ display: 'flex' }}>
        <TickerItem label="Total TVL"       value={PROTO.tvl}            color="#fff"    tip="Total value of all CC collateral deposited across all vaults" />
        <TickerItem label="ONE Circulating" value={PROTO.supply}         color={C.cyan}  tip="Total ONE stablecoins currently minted and in circulation" />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right group — live status indicators */}
      <div style={{ display: 'flex', borderLeft: `2px solid ${C.border}` }}>

        {/* System Health — mini zone strip */}
        <div style={{ padding: '10px 20px', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            System Health <Tip text="Total CC value ÷ total ONE borrowed. Safe above 150%." placement="down" />
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* mini zone bar — 100-300% range, needle at 47% (194%) */}
            <div style={{ position: 'relative', width: 64, height: 5, borderRadius: 3 }}>
              <div style={{ display: 'flex', height: '100%', borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                <div style={{ width: '20%', background: 'rgba(239,68,68,0.4)', borderRadius: '3px 0 0 3px' }} />
                <div style={{ width: '15%', background: 'rgba(245,158,11,0.4)' }} />
                <div style={{ flex: 1, background: 'rgba(16,185,129,0.35)', borderRadius: '0 3px 3px 0' }} />
              </div>
              <div style={{ position: 'absolute', top: -2, bottom: -2, left: 'calc(47% - 1px)', width: 2, background: C.green, borderRadius: 1, boxShadow: `0 0 5px ${C.green}` }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.green, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.02em' }}>194%</span>
          </div>
        </div>

        {/* CC Price — coin badge + price */}
        <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CCCoinBadge size={30} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              CC Price <Tip text="Canton Network oracle price for CC/USD" placement="down" />
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.teal, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.02em' }}>{PROTO.ccPrice}</span>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function Dashboard({ connected, onConnect, vault, onVaultClose, walletONE = 0 }) {
  const navigate    = useNavigate()
  const risk        = vault ? computeRisk(vault.ccAmount, vault.oneDebt) : null
  const maxWithdraw = risk ? Math.max(0, Math.floor((vault.ccAmount * CC_PRICE - vault.oneDebt / (MAX_LTV / 100)) / CC_PRICE)) : 0

  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── STATE 1: not connected ── */}
      {!connected && (
        <Card style={{ padding: 52, textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(20,184,166,0.1)', border: `2px solid ${C.teal}33`, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IcoShield />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>Connect your wallet</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>Open a vault, deposit CC, and mint ONE stablecoins.</div>
          <Btn label="Connect Wallet" onClick={onConnect} color="primary" size="lg" />
        </Card>
      )}

      {/* ── STATE 2: connected, no vault ── */}
      {connected && !vault && (
        <Card style={{ padding: 52, textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(20,184,166,0.1)', border: `2px solid ${C.teal}33`, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <CCCoinBadge size={40} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>No vault yet</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
            Deposit CC as collateral and borrow ONE at up to {MAX_LTV}% LTV. Fixed {INTEREST_RATE}% p.a. interest, locked at opening.
          </div>
          <Btn label="Open Vault" onClick={() => navigate('/open')} color="primary" size="lg" icon={<IcoPlus />} />
        </Card>
      )}

      {/* ── STATE 3: connected + vault ── */}
      {connected && vault && risk && (
        <>
          {/* Stat strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Collateral',  tip: 'USD value of CC locked in your vault',                              val: `$${(vault.ccAmount * CC_PRICE).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `${vault.ccAmount.toLocaleString()} CC` },
              { label: 'ONE Debt',    tip: 'Total ONE minted — 5% p.a. interest accrues on this balance.',      val: `${vault.oneDebt.toLocaleString()} ONE`, sub: `≈ $${vault.oneDebt.toLocaleString()}`, color: C.cyan },
              { label: 'LTV',         tip: `Loan-to-Value ratio. Liquidation triggers at ${LIQ_LTV}%.`,         val: `${risk.ltv.toFixed(1)}%`, sub: `Liq. at ${LIQ_LTV}%`, color: riskColor(risk.status) },
              { label: 'Liq. Price',  tip: 'CC/USD price at which this vault becomes eligible for liquidation.', val: `$${risk.liqPrice.toFixed(3)}`, sub: `${risk.priceDrop.toFixed(0)}% buffer`, color: riskColor(risk.status) },
            ].map((m, i) => (
              <Card key={i} style={{ padding: '18px 20px' }}>
                <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>{m.label} <Tip text={m.tip} /></div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', color: m.color || '#fff' }}>{m.val}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{m.sub}</div>
              </Card>
            ))}
          </div>

          {/* Combined action cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

            {/* CC Collateral */}
            <Card style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <CCCoinBadge size={18} />
                <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600 }}>CC Collateral</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 2 }}>
                ${(vault.ccAmount * CC_PRICE).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{vault.ccAmount.toLocaleString()} CC deposited</div>
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {[
                  { label: 'Deposit CC',  desc: 'Add collateral to improve your CR',                        path: '/vault/deposit',  accent: C.teal  },
                  { label: 'Withdraw CC', desc: `${maxWithdraw.toLocaleString()} CC withdrawable at current LTV`, path: '/vault/withdraw', accent: C.muted },
                ].map((a, i) => (
                  <div key={a.label} onClick={() => navigate(a.path)} className="card-hover"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: 'pointer', borderBottom: i === 0 ? `1px solid ${C.border}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{a.desc}</div>
                    </div>
                    <span style={{ color: a.accent, flexShrink: 0 }}><IcoArrow /></span>
                  </div>
                ))}
              </div>
            </Card>

            {/* ONE Debt */}
            <Card style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <ONEMark size={18} />
                <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600 }}>ONE Debt</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: C.cyan, marginBottom: 2 }}>
                {vault.oneDebt.toLocaleString()} ONE
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>≈ ${vault.oneDebt.toLocaleString()} · {risk.ltv.toFixed(1)}% LTV</div>
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {[
                  { label: 'Mint ONE',  desc: `${risk.available.toLocaleString()} ONE available at ${MAX_LTV}% LTV`, path: '/vault/mint',  accent: C.cyan  },
                  { label: 'Repay ONE', desc: 'Reduce outstanding debt · improve collateral ratio',                    path: '/vault/repay', accent: C.green },
                ].map((a, i) => (
                  <div key={a.label} onClick={() => navigate(a.path)} className="card-hover"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: 'pointer', borderBottom: i === 0 ? `1px solid ${C.border}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{a.desc}</div>
                    </div>
                    <span style={{ color: a.accent, flexShrink: 0 }}><IcoArrow /></span>
                  </div>
                ))}
              </div>
            </Card>

          </div>

          {/* Position Health */}
          <Card style={{ padding: 24, marginBottom: 12 }}>
            <RiskPanel risk={risk} />
          </Card>

          {/* Position History */}
          <Collapse title="Position History" icon={<IcoSpark />}>
            {(() => {
              const histRows = [
                { time: 'May 13, 2026 · 09:42', action: 'OPEN', ccChange: `+${vault.ccAmount.toLocaleString()} CC`, oneChange: `+${vault.oneDebt.toLocaleString()} ONE`, result: `LTV ${risk.ltv.toFixed(1)}%` },
              ]
              if (histRows.length === 0) return (
                <EmptyState icon={<IcoSpark />} title="No history yet" hint="Deposits, withdrawals, mints, and repayments will appear here." compact />
              )
              return (
                <div style={{ overflowX: 'auto', paddingTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>{['Time', 'Action', 'CC Change', 'ONE Change', 'Result'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 0 10px', color: C.muted, fontWeight: 600, fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {histRows.map((row, i) => (
                        <tr key={i}>
                          <td style={{ padding: '10px 0', color: C.muted }}>{row.time}</td>
                          <td style={{ padding: '10px 0' }}><span style={{ padding: '3px 8px', borderRadius: 100, background: 'rgba(20,184,166,0.1)', border: `1px solid ${C.teal}33`, fontSize: 11, fontWeight: 700, color: C.teal }}>{row.action}</span></td>
                          <td style={{ padding: '10px 0', color: C.green, fontFamily: 'JetBrains Mono, monospace' }}>{row.ccChange}</td>
                          <td style={{ padding: '10px 0', color: C.cyan, fontFamily: 'JetBrains Mono, monospace' }}>{row.oneChange}</td>
                          <td style={{ padding: '10px 0', color: '#fff' }}>{row.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </Collapse>

          {/* Loan Terms */}
          <Collapse title="Loan Terms & Parameters" icon={<IcoToken />}>
            <Row label="Max Borrow LTV"      value={`${MAX_LTV}%`}                        tip="Maximum ONE you can borrow per dollar of CC collateral" />
            <Row label="Liquidation LTV"     value={`${LIQ_LTV}%`}                        tip="If your LTV hits this threshold, liquidators can repay your debt and claim discounted CC" />
            <Row label="Liquidation Penalty" value="10%"                                   tip="Bonus CC paid to liquidators — incentivises prompt action when vaults go underwater" />
            <Row label="Origination Fee"     value={`${(MINT_FEE_PCT*100).toFixed(2)}%`}  tip="One-time fee on each borrow — added to debt, not deducted from payout" />
            <Row label="Fixed Interest Rate" value={`${INTEREST_RATE}% p.a.`}             tip="Locked at vault opening — your rate never changes." highlight={C.amber} />
            <Row label="Liquidation Reserve" value={`${LIQ_RESERVE} ONE`}                 tip="Held at vault open, fully refunded when you close" />
            <Row label="Oracle (CC/USD)"     value={`$${CC_PRICE.toFixed(4)}`}            tip="Real-time Canton Network oracle price" mono />
          </Collapse>

          {/* Close Vault — full-width */}
          <div style={{ marginBottom: 32, marginTop: 4 }}>
            <button onClick={() => navigate('/vault/close')}
              style={{ width: '100%', padding: '15px 24px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.05)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IcoClose />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(248,113,113,0.9)', letterSpacing: '-0.01em' }}>Close Vault</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Repay debt · reclaim {vault.ccAmount.toLocaleString()} CC collateral</div>
                </div>
              </div>
              <span style={{ color: 'rgba(239,68,68,0.5)', flexShrink: 0 }}><IcoArrow /></span>
            </button>
          </div>
        </>
      )}

      {/* CC Collateral parameters card */}
      <CCParamsCard />

    </div>
  )
}


// ─── CC COLLATERAL PARAMS CARD ────────────────────────────────────────────────

function CCParamsCard() {
  const params = [
    { label: 'Oracle Price',       value: `$${CC_PRICE.toFixed(2)}`,           color: '#fff',    tip: 'Live CC/USD price from Canton oracle' },
    { label: 'Max LTV',            value: `${MAX_LTV}%`,                        color: C.green,   tip: 'Max ONE you can mint per dollar of CC deposited' },
    { label: 'Liquidation at',     value: `${LIQ_LTV}%`,                        color: C.amber,   tip: 'LTV at which your vault can be liquidated' },
    { label: 'Origination Fee',    value: `${(MINT_FEE_PCT*100).toFixed(2)}%`,  color: C.amber,   tip: 'One-time fee charged when you mint ONE' },
    { label: 'Annual Interest',    value: `${INTEREST_RATE}% p.a.`,             color: C.cyan,    tip: 'Ongoing interest that accrues on your ONE debt' },
    { label: 'Liq. Penalty',       value: '10%',                                color: C.red,     tip: 'Bonus paid to liquidators — incentivises fast action' },
  ]

  return (
    <Card>
      {/* Header strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${C.border}`, background: `linear-gradient(90deg, rgba(20,184,166,0.06), transparent)`, borderRadius: '16px 16px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CCCoinBadge size={42} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Canton Coin (CC)</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Accepted collateral · Canton Network</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>TVL</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>{PROTO.tvl}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>ONE Minted</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.cyan, fontFamily: 'JetBrains Mono, monospace' }}>{PROTO.supply}</div>
          </div>
        </div>
      </div>

      {/* Param pills row */}
      <div style={{ display: 'flex', padding: '20px 24px', gap: 10, flexWrap: 'wrap' }}>
        {params.map(p => (
          <div key={p.label} className="tip-wrap" style={{ flexDirection: 'column', background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 20px', cursor: 'default', minWidth: 140 }}>
            <span className="tip">{p.tip}</span>
            <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10, whiteSpace: 'nowrap' }}>{p.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: p.color, letterSpacing: '-0.03em', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{p.value}</div>
          </div>
        ))}

        {/* System CR — zone health meter */}
        <div style={{ flex: 1, minWidth: 260, background: C.raised, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              System Health <Tip text="Total CC value ÷ total ONE borrowed. Safe above 150%." />
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.green, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>194%</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.green, padding: '2px 7px', borderRadius: 100, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>Healthy</span>
            </div>
          </div>
          {/* Zone-segmented track: Danger 100-140% (20%), Moderate 140-170% (15%), Healthy 170%+ (65%) */}
          {/* Scale: 100-300% range = 200pts. Current 194% → position (194-100)/200 = 47% */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              <div style={{ width: '20%', background: 'rgba(239,68,68,0.35)', borderRadius: '4px 0 0 4px' }} />
              <div style={{ width: '15%', background: 'rgba(245,158,11,0.35)' }} />
              <div style={{ flex: 1, background: 'rgba(16,185,129,0.25)', borderRadius: '0 4px 4px 0' }} />
            </div>
            {/* Current position needle at 47% */}
            <div style={{ position: 'absolute', top: -4, left: 'calc(47% - 1px)', width: 2, height: 16, background: C.green, borderRadius: 1, boxShadow: '0 0 6px rgba(16,185,129,0.7)' }} />
          </div>
          {/* Zone labels */}
          <div style={{ display: 'flex', fontSize: 12, color: C.muted, letterSpacing: '0.04em' }}>
            <span style={{ width: '20%', color: C.red, opacity: 0.7 }}>Danger</span>
            <span style={{ width: '15%', color: C.amber, opacity: 0.7 }}>Moderate</span>
            <span style={{ flex: 1, color: C.green, opacity: 0.7 }}>Healthy · $4.25M CC / $2.18M ONE</span>
          </div>
        </div>
      </div>

      {/* Trust strip */}
      <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}`, padding: '16px 24px', gap: 0 }}>
        {[
          { label: 'Powered by',   name: 'Canton Network',  sub: 'Institutional-grade L1', icon: '/canton-icon.svg' },
          { label: 'Settlement via', name: 'Chainlink',     sub: 'Real-time CC/USD feed',  icon: '/chainlink-logo.svg' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, paddingRight: 28, marginRight: 28, borderRight: i === 0 ? `1px solid ${C.border}` : 'none' }}>
            <img src={item.icon} alt={item.name} style={{ height: 28, width: 28, objectFit: 'contain', opacity: 0.85, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{item.name}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── SHARED ACTION HELPERS ────────────────────────────────────────────────────

function ActionBreadcrumb({ label }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
      <button onClick={() => navigate('/vault')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 13, padding: 0 }}>
        <IcoBack /> Overview
      </button>
      <span style={{ color: C.border }}>›</span>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
    </div>
  )
}

function RiskSidePanel({ currentRisk, displayRisk, hasChange }) {
  return (
    <Card style={{ padding: 28, background: C.raised }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IcoShield /> Position Health</span>
        {hasChange && <span style={{ fontSize: 11, color: C.teal, padding: '3px 10px', borderRadius: 100, background: 'rgba(20,184,166,0.1)', border: `1px solid ${C.teal}33` }}>Updated</span>}
      </div>
      <RiskPanel risk={displayRisk} prevRisk={hasChange ? currentRisk : null} />
    </Card>
  )
}

function ImpactArrow({ color }) {
  return <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 5h11M8.5 1.5l3.5 3.5-3.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function PositionImpact({ currentRisk, projRisk, hasChange, currDebt, projDebt, currCC, projCC }) {
  if (!currentRisk) return null
  const r0 = currentRisk
  const r1 = hasChange && projRisk ? projRisk : null

  const rows = [
    {
      label: 'Collateral',
      curr: `$${r0.collateralUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${currCC.toLocaleString()} CC)`,
      proj: r1 ? `$${r1.collateralUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} (${projCC.toLocaleString()} CC)` : null,
      good: r1 ? r1.collateralUSD > r0.collateralUSD : null,
      neutral: r1 ? r1.collateralUSD === r0.collateralUSD : null,
    },
    {
      label: 'Outstanding Debt',
      curr: `${currDebt.toLocaleString()} ONE`,
      proj: r1 ? `${projDebt.toLocaleString()} ONE` : null,
      good: r1 ? projDebt < currDebt : null,
      neutral: r1 ? projDebt === currDebt : null,
    },
    {
      label: 'LTV Ratio',
      curr: `${r0.ltv.toFixed(2)}%`,
      proj: r1 ? `${r1.ltv.toFixed(2)}%` : null,
      good: r1 ? r1.ltv < r0.ltv : null,
      neutral: r1 ? r1.ltv === r0.ltv : null,
    },
    {
      label: 'Liquidation Price',
      curr: r0.liqPrice > 0 ? `$${r0.liqPrice.toFixed(4)}` : '—',
      proj: r1 && r1.liqPrice > 0 ? `$${r1.liqPrice.toFixed(4)}` : null,
      good: r1 && r1.liqPrice > 0 ? r1.liqPrice < r0.liqPrice : null,
      neutral: r1 ? r1.liqPrice === r0.liqPrice : null,
    },
  ]

  const status = r1 ? r1.status : r0.status
  const statusColor = riskColor(status)

  return (
    <div style={{ background: C.raised, borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600 }}>Position Impact</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 100, background: riskBg(status), border: `1px solid ${statusColor}44` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{status}</span>
        </div>
      </div>
      {rows.map(row => {
        const changed = row.proj !== null && row.proj !== row.curr
        const projColor = !changed || row.neutral ? '#fff' : row.good ? C.green : C.amber
        return (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: C.muted }}>{row.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'JetBrains Mono, monospace' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: changed ? C.muted : '#fff' }}>{row.curr}</span>
              {changed && <>
                <ImpactArrow color={projColor} />
                <span style={{ fontSize: 12, fontWeight: 700, color: projColor }}>{row.proj}</span>
              </>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── VAULT ACTION PAGES ───────────────────────────────────────────────────────

function VaultDepositPage({ vault, walletCC, walletONE, onVaultUpdate }) {
  const navigate    = useNavigate()
  const [colAmt, setColAmt]     = useState('')
  const [alsoMint, setAlsoMint] = useState(false)
  const [debtAmt, setDebtAmt]   = useState('')

  if (!vault) return <Navigate to="/vault" />

  const currentRisk = useMemo(() => computeRisk(vault.ccAmount, vault.oneDebt), [vault])
  const projRisk    = useMemo(() => {
    const cc   = vault.ccAmount + (Number(colAmt) || 0)
    const debt = vault.oneDebt + (alsoMint && Number(debtAmt) > 0 ? Number(debtAmt) : 0)
    return computeRisk(Math.max(0, cc), Math.max(0, debt))
  }, [vault, colAmt, debtAmt, alsoMint])

  const hasChange   = !!colAmt || (alsoMint && !!debtAmt)
  const displayRisk = hasChange ? projRisk : currentRisk
  const maxAlsoMint = colAmt ? Math.max(0, Math.floor((Number(colAmt) + vault.ccAmount) * CC_PRICE * (MAX_LTV / 100) - vault.oneDebt - LIQ_RESERVE)) : 0
  const feeONE      = Number(debtAmt) > 0 ? (Number(debtAmt) * MINT_FEE_PCT).toFixed(2) : '0.00'

  const doDeposit = () => {
    const cc = Number(colAmt)
    if (!cc) return
    const addDebt = alsoMint && Number(debtAmt) > 0 ? Number(debtAmt) * (1 + MINT_FEE_PCT) : 0
    onVaultUpdate({ ...vault, ccAmount: vault.ccAmount + cc, oneDebt: vault.oneDebt + addDebt }, { cc: -cc, one: alsoMint ? Number(debtAmt) : 0 })
    navigate('/vault')
  }

  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <ActionBreadcrumb label="Deposit CC" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <CCCoinBadge size={26} />
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Deposit CC</div>
          </div>
          <AmountInput label="How much CC to deposit?" value={colAmt} onChange={setColAmt}
            max={walletCC} unit="CC"
            usdValue={colAmt ? `$${(Number(colAmt) * CC_PRICE).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00'}
            hint={`Wallet: ${walletCC.toLocaleString()} CC`} subHint={`Wallet: ${walletCC.toLocaleString()} CC`} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: alsoMint ? 12 : 20 }}>
            <input type="checkbox" checked={alsoMint} onChange={e => { setAlsoMint(e.target.checked); if (!e.target.checked) setDebtAmt('') }} style={{ accentColor: C.teal, width: 15, height: 15 }} />
            <span style={{ fontSize: 13, color: alsoMint ? '#fff' : C.muted }}>Also mint ONE with this deposit</span>
          </label>
          {alsoMint && (
            <>
              <AmountInput label="How much ONE to mint?" value={debtAmt} onChange={setDebtAmt}
                max={maxAlsoMint} unit="ONE"
                usdValue={debtAmt ? `≈ $${Number(debtAmt).toFixed(2)}` : '$0.00'}
                subHint={colAmt ? `Max ${maxAlsoMint.toLocaleString()} ONE at ${MAX_LTV}% LTV` : 'Enter deposit amount first'} />
              {Number(debtAmt) > 0 && (
                <div style={{ background: C.raised, borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
                  <Row label="Proceeds received" value={`${debtAmt} ONE`} tip="This exact amount is credited to your wallet" />
                  <Row label={`Origination fee (${(MINT_FEE_PCT*100).toFixed(2)}%)`} value={`+${feeONE} ONE`} highlight={C.amber} tip="One-time fee added to outstanding debt — not deducted from proceeds" />
                  <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>Net debt increase</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.cyan, fontFamily: 'JetBrains Mono, monospace' }}>{(Number(debtAmt) + Number(feeONE)).toFixed(2)} ONE</span>
                  </div>
                </div>
              )}
            </>
          )}
          <PositionImpact
            currentRisk={currentRisk} projRisk={hasChange ? projRisk : null} hasChange={hasChange}
            currDebt={vault.oneDebt} projDebt={vault.oneDebt + (alsoMint && Number(debtAmt) > 0 ? Number(debtAmt) * (1 + MINT_FEE_PCT) : 0)}
            currCC={vault.ccAmount} projCC={vault.ccAmount + (Number(colAmt) || 0)}
          />
          <Btn label={alsoMint && debtAmt ? 'Deposit & Mint ONE' : 'Deposit CC'} color="primary" full disabled={!colAmt || Number(colAmt) <= 0} onClick={doDeposit} />
        </Card>
        <RiskSidePanel currentRisk={currentRisk} displayRisk={displayRisk} hasChange={hasChange} />
      </div>
    </div>
  )
}

function VaultWithdrawPage({ vault, walletCC, walletONE, onVaultUpdate }) {
  const navigate      = useNavigate()
  const [colAmt, setColAmt]       = useState('')
  const [alsoRepay, setAlsoRepay] = useState(false)
  const [debtAmt, setDebtAmt]     = useState('')

  if (!vault) return <Navigate to="/vault" />

  const currentRisk = useMemo(() => computeRisk(vault.ccAmount, vault.oneDebt), [vault])
  const projRisk    = useMemo(() => {
    const cc   = vault.ccAmount - (Number(colAmt) || 0)
    const debt = vault.oneDebt  - (alsoRepay && Number(debtAmt) > 0 ? Number(debtAmt) : 0)
    return computeRisk(Math.max(0, cc), Math.max(0, debt))
  }, [vault, colAmt, debtAmt, alsoRepay])

  const hasChange   = !!colAmt || (alsoRepay && !!debtAmt)
  const displayRisk = hasChange ? projRisk : currentRisk
  const maxRepay    = Math.max(0, vault.oneDebt - LIQ_RESERVE - MIN_DEBT)
  // maxWithdraw is dynamic — recalculated after the repay amount is applied first
  const debtAfterRepay = alsoRepay && Number(debtAmt) > 0 ? vault.oneDebt - Number(debtAmt) : vault.oneDebt
  const maxWithdraw    = Math.max(0, Math.floor((vault.ccAmount * CC_PRICE - debtAfterRepay / (MAX_LTV / 100)) / CC_PRICE))

  const doWithdraw = () => {
    const cc = Number(colAmt)
    if (!cc) return
    const removeDebt = alsoRepay && Number(debtAmt) > 0 ? Number(debtAmt) : 0
    onVaultUpdate({ ...vault, ccAmount: vault.ccAmount - cc, oneDebt: vault.oneDebt - removeDebt }, { cc, one: -removeDebt })
    navigate('/vault')
  }

  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <ActionBreadcrumb label="Withdraw CC" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <CCCoinBadge size={26} />
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Withdraw CC</div>
          </div>
          {/* Repay first — unlocks more CC, so it comes before the withdraw input */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: alsoRepay ? 12 : 20 }}>
            <input type="checkbox" checked={alsoRepay} onChange={e => { setAlsoRepay(e.target.checked); if (!e.target.checked) { setDebtAmt(''); setColAmt('') } }} style={{ accentColor: C.teal, width: 15, height: 15 }} />
            <span style={{ fontSize: 13, color: alsoRepay ? '#fff' : C.muted }}>Repay ONE first to unlock more CC</span>
          </label>
          {alsoRepay && (
            <AmountInput label="How much ONE to repay?" value={debtAmt} onChange={v => { setDebtAmt(v); setColAmt('') }}
              max={maxRepay} unit="ONE"
              usdValue={debtAmt ? `≈ $${Number(debtAmt).toFixed(2)}` : '$0.00'}
              subHint={`Max repayable: ${maxRepay.toLocaleString()} ONE · Wallet: ${walletONE.toLocaleString()} ONE`} />
          )}
          <AmountInput label="How much CC to withdraw?" value={colAmt} onChange={setColAmt}
            max={maxWithdraw} unit="CC"
            usdValue={colAmt ? `$${(Number(colAmt) * CC_PRICE).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00'}
            subHint={`${maxWithdraw.toLocaleString()} CC available at current LTV`} />
          <PositionImpact
            currentRisk={currentRisk} projRisk={hasChange ? projRisk : null} hasChange={hasChange}
            currDebt={vault.oneDebt} projDebt={vault.oneDebt - (alsoRepay && Number(debtAmt) > 0 ? Number(debtAmt) : 0)}
            currCC={vault.ccAmount} projCC={vault.ccAmount - (Number(colAmt) || 0)}
          />
          <Btn label={alsoRepay && debtAmt ? 'Repay & Withdraw CC' : 'Withdraw CC'} color="ghost" full disabled={!colAmt || Number(colAmt) <= 0} onClick={doWithdraw} />
        </Card>
        <RiskSidePanel currentRisk={currentRisk} displayRisk={displayRisk} hasChange={hasChange} />
      </div>
    </div>
  )
}

function VaultMintPage({ vault, walletCC, walletONE, onVaultUpdate }) {
  const navigate      = useNavigate()
  const [debtAmt,     setDebtAmt]     = useState('')
  const [alsoDeposit, setAlsoDeposit] = useState(false)
  const [colAmt,      setColAmt]      = useState('')

  if (!vault) return <Navigate to="/vault" />

  const extraCC     = alsoDeposit && Number(colAmt) > 0 ? Number(colAmt) : 0
  const totalCC     = vault.ccAmount + extraCC
  const currentRisk = useMemo(() => computeRisk(vault.ccAmount, vault.oneDebt), [vault])
  const projRisk    = useMemo(() => computeRisk(totalCC, vault.oneDebt + (Number(debtAmt) || 0)), [vault, totalCC, debtAmt])
  const hasChange   = !!debtAmt || extraCC > 0
  const displayRisk = hasChange ? projRisk : currentRisk
  const maxMintMore = computeRisk(totalCC, vault.oneDebt).available
  const feeONE      = Number(debtAmt) > 0 ? (Number(debtAmt) * MINT_FEE_PCT).toFixed(2) : '0.00'
  const bothActive  = alsoDeposit && Number(colAmt) > 0 && Number(debtAmt) > 0

  const doMint = () => {
    const debt = Number(debtAmt)
    if (!debt) return
    onVaultUpdate(
      { ...vault, ccAmount: vault.ccAmount + extraCC, oneDebt: vault.oneDebt + debt + debt * MINT_FEE_PCT },
      { cc: -extraCC, one: debt }
    )
    navigate('/vault')
  }

  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <ActionBreadcrumb label="Mint ONE" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <ONEMark size={26} />
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Mint ONE</div>
          </div>

          {/* Optional: also deposit CC first */}
          <div style={{ background: alsoDeposit ? 'rgba(20,184,166,0.06)' : C.raised, border: `1px solid ${alsoDeposit ? C.teal + '44' : C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, cursor: 'pointer' }}
            onClick={() => { setAlsoDeposit(v => !v); setColAmt('') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${alsoDeposit ? C.teal : C.muted}`, background: alsoDeposit ? C.teal : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                {alsoDeposit && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#041a19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: alsoDeposit ? '#fff' : C.muted }}>Also deposit CC first to mint more</span>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>Add collateral before minting to increase your available limit</div>
              </div>
            </div>
          </div>
          {alsoDeposit && (
            <div style={{ marginBottom: 16 }}>
              <AmountInput label="CC to deposit first" value={colAmt} onChange={v => { setColAmt(v); setDebtAmt('') }}
                max={walletCC} unit="CC"
                usdValue={colAmt ? `≈ $${(Number(colAmt) * CC_PRICE).toFixed(2)}` : '$0.00'}
                subHint={`Wallet: ${walletCC.toLocaleString()} CC`} />
            </div>
          )}

          <AmountInput label="How much ONE to mint?" value={debtAmt} onChange={setDebtAmt}
            max={maxMintMore} unit="ONE"
            usdValue={debtAmt ? `≈ $${Number(debtAmt).toFixed(2)}` : '$0.00'}
            subHint={`${maxMintMore.toLocaleString()} ONE available${extraCC > 0 ? ' (with added CC)' : ''}`} />

          {Number(debtAmt) > 0 && (
            <div style={{ background: C.raised, borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
              {alsoDeposit && Number(colAmt) > 0 && (
                <Row label="Collateral deposited" value={`+${Number(colAmt).toLocaleString()} CC`} highlight={C.teal} />
              )}
              <Row label="Proceeds received" value={`${debtAmt || '0'} ONE`} tip="This exact amount is credited to your wallet" />
              <Row label={`Origination fee (${(MINT_FEE_PCT*100).toFixed(2)}%)`} value={`+${feeONE} ONE`} highlight={C.amber} tip="One-time fee added to outstanding debt — not deducted from proceeds" />
              <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Net debt increase</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.cyan, fontFamily: 'JetBrains Mono, monospace' }}>{(Number(debtAmt) + Number(feeONE)).toFixed(2)} ONE</span>
              </div>
            </div>
          )}
          <PositionImpact
            currentRisk={currentRisk} projRisk={hasChange ? projRisk : null} hasChange={hasChange}
            currDebt={vault.oneDebt} projDebt={vault.oneDebt + (Number(debtAmt) || 0) * (1 + MINT_FEE_PCT)}
            currCC={vault.ccAmount} projCC={vault.ccAmount + extraCC}
          />
          <Btn label={bothActive ? 'Deposit & Mint ONE' : 'Mint ONE'} color="primary" full disabled={!debtAmt || Number(debtAmt) <= 0} onClick={doMint} />
        </Card>
        <RiskSidePanel currentRisk={currentRisk} displayRisk={displayRisk} hasChange={hasChange} />
      </div>
    </div>
  )
}

function VaultRepayPage({ vault, walletCC, walletONE, onVaultUpdate }) {
  const navigate        = useNavigate()
  const [debtAmt,       setDebtAmt]       = useState('')
  const [alsoWithdraw,  setAlsoWithdraw]  = useState(false)
  const [colAmt,        setColAmt]        = useState('')

  if (!vault) return <Navigate to="/vault" />

  const currentRisk    = useMemo(() => computeRisk(vault.ccAmount, vault.oneDebt), [vault])
  const debtAfterRepay = vault.oneDebt - (Number(debtAmt) || 0)
  const withdrawCC     = alsoWithdraw && Number(colAmt) > 0 ? Number(colAmt) : 0
  const projRisk       = useMemo(() => computeRisk(vault.ccAmount - withdrawCC, Math.max(0, debtAfterRepay)), [vault, debtAfterRepay, withdrawCC])
  const hasChange      = !!debtAmt || withdrawCC > 0
  const displayRisk    = hasChange ? projRisk : currentRisk
  const maxRepay       = Math.max(0, vault.oneDebt - LIQ_RESERVE - MIN_DEBT)
  const maxWithdrawAfter = Number(debtAmt) > 0
    ? Math.max(0, Math.floor((vault.ccAmount * CC_PRICE - debtAfterRepay / (MAX_LTV / 100)) / CC_PRICE))
    : 0
  const bothActive     = alsoWithdraw && Number(colAmt) > 0 && Number(debtAmt) > 0

  const doRepay = () => {
    const repay    = Math.min(Number(debtAmt), maxRepay)
    if (!repay) return
    onVaultUpdate(
      { ...vault, oneDebt: vault.oneDebt - repay, ccAmount: vault.ccAmount - withdrawCC },
      { one: -repay, cc: withdrawCC }
    )
    navigate('/vault')
  }

  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <ActionBreadcrumb label="Repay ONE" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <ONEMark size={26} />
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Repay ONE</div>
          </div>
          {maxRepay === 0 ? (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              Debt is at minimum ({MIN_DEBT} ONE). To fully exit, use <strong>Close Vault</strong> on the overview.
            </div>
          ) : (
            <>
              <AmountInput label="How much ONE to repay?" value={debtAmt} onChange={v => { setDebtAmt(v); setColAmt('') }}
                max={maxRepay} unit="ONE"
                usdValue={debtAmt ? `≈ $${Number(debtAmt).toFixed(2)}` : '$0.00'}
                subHint={`Max repayable: ${maxRepay.toLocaleString()} ONE · Wallet: ${walletONE.toLocaleString()} ONE`} />

              {/* Optional: also withdraw CC after repaying */}
              <div style={{ background: alsoWithdraw ? 'rgba(20,184,166,0.06)' : C.raised, border: `1px solid ${alsoWithdraw ? C.teal + '44' : C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, cursor: 'pointer' }}
                onClick={() => { setAlsoWithdraw(v => !v); setColAmt('') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${alsoWithdraw ? C.teal : C.muted}`, background: alsoWithdraw ? C.teal : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                    {alsoWithdraw && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#041a19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: alsoWithdraw ? '#fff' : C.muted }}>Also withdraw CC after repaying</span>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
                      {Number(debtAmt) > 0 ? `Up to ${maxWithdrawAfter.toLocaleString()} CC unlocked after repay` : 'Enter repay amount first to see available CC'}
                    </div>
                  </div>
                </div>
              </div>
              {alsoWithdraw && (
                <div style={{ marginBottom: 16 }}>
                  <AmountInput label="CC to withdraw after repaying" value={colAmt} onChange={setColAmt}
                    max={maxWithdrawAfter} unit="CC"
                    usdValue={colAmt ? `≈ $${(Number(colAmt) * CC_PRICE).toFixed(2)}` : '$0.00'}
                    subHint={`${maxWithdrawAfter.toLocaleString()} CC available after repay`} />
                </div>
              )}

              <PositionImpact
                currentRisk={currentRisk} projRisk={hasChange ? projRisk : null} hasChange={hasChange}
                currDebt={vault.oneDebt} projDebt={Math.max(0, vault.oneDebt - (Number(debtAmt) || 0))}
                currCC={vault.ccAmount} projCC={vault.ccAmount - withdrawCC}
              />
            </>
          )}
          <Btn label={bothActive ? 'Repay & Withdraw CC' : 'Repay ONE'} color="success" full disabled={maxRepay === 0 || !debtAmt || Number(debtAmt) <= 0} onClick={doRepay} />
        </Card>
        <RiskSidePanel currentRisk={currentRisk} displayRisk={displayRisk} hasChange={hasChange} />
      </div>
    </div>
  )
}

function VaultClosePage({ vault, walletONE, onVaultClose }) {
  const navigate = useNavigate()
  if (!vault) return <Navigate to="/vault" />

  const youRepay    = vault.oneDebt - LIQ_RESERVE
  const canClose    = walletONE >= youRepay
  const collateralUSD = (vault.ccAmount * CC_PRICE).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const risk        = computeRisk(vault.ccAmount, vault.oneDebt)

  const doClose = () => {
    onVaultClose()
    navigate('/vault')
  }

  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <ActionBreadcrumb label="Close Vault" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Left — close details */}
        <Card style={{ padding: 28, borderColor: 'rgba(239,68,68,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IcoClose />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Close Vault</div>
              <div style={{ fontSize: 12, color: C.muted }}>Repay debt in full · reclaim all collateral</div>
            </div>
          </div>

          {/* Debt breakdown */}
          <div style={{ background: C.raised, borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Repayment</div>
            <Row label="Total Debt" value={`${vault.oneDebt.toLocaleString()} ONE`} />
            <Row label={`Liquidation Reserve (refunded)`} value={`− ${LIQ_RESERVE} ONE`} highlight={C.green} tip="Held at vault open, fully refunded on close" />
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: C.muted }}>You repay</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>{youRepay.toLocaleString()} ONE</span>
            </div>
          </div>

          {/* Collateral return */}
          <div style={{ background: C.raised, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Collateral Returned</div>
            <Row label="Wallet balance" value={`${walletONE.toLocaleString()} ONE`} highlight={canClose ? C.green : '#f87171'} />
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: C.muted }}>You reclaim</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: C.green, fontFamily: 'JetBrains Mono, monospace' }}>{vault.ccAmount.toLocaleString()} CC <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>≈ ${collateralUSD}</span></span>
            </div>
          </div>

          {!canClose && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#f87171', lineHeight: 1.5 }}>
              <strong>Insufficient ONE balance.</strong> You need <strong>{youRepay.toLocaleString()} ONE</strong> but hold <strong>{walletONE.toLocaleString()} ONE</strong>. Your repayment amount includes the origination fee applied at vault opening, so it will always exceed the original proceeds received. Acquire the shortfall via DVP or secondary markets.
            </div>
          )}

          <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
            Closing permanently repays all debt and returns your full CC collateral. This action cannot be undone.
          </div>
          <Btn label="Confirm & Close Vault" color="danger" full disabled={!canClose} onClick={doClose} />
        </Card>

        {/* Right — position summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Current Position</div>
            <RiskPanel risk={risk} />
          </Card>
          <Card style={{ padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>After Close</div>
            {[
              { label: 'ONE Debt',      val: '0 ONE',                                        color: C.green },
              { label: 'CC Collateral', val: `${vault.ccAmount.toLocaleString()} CC → Wallet`, color: C.green },
              { label: 'LTV',           val: '0%',                                            color: C.green },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, color: C.muted }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.color, fontFamily: 'JetBrains Mono, monospace' }}>{r.val}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ─── EARN ─────────────────────────────────────────────────────────────────────

const YONE_RATE  = 1.0847  // 1 yONE = X ONE (appreciates as liquidation gains compound)
const VAULT_SIZE = 820000  // ONE equivalent in Stability Vault

function EarnPage({ connected, onConnect, walletONE = 0, walletYONE = 0, onStake, onUnstake }) {
  const [tab,       setTab]       = useState('Stake')
  const [amt,       setAmt]       = useState('')
  const [apyPeriod, setApyPeriod] = useState('30D')
  const [txDone,      setTxDone]      = useState(null) // { action: 'Staked'|'Unstaked', inAmt, inToken, outAmt, outToken }
  const [txCountdown, setTxCountdown] = useState(5)

  const apyByPeriod = { '7D': '24.3%', '30D': '21.26%', 'All': '18.9%' }

  useEffect(() => {
    if (!txDone) { setTxCountdown(5); return }
    setTxCountdown(5)
    const iv = setInterval(() => {
      setTxCountdown(prev => {
        if (prev <= 1) { clearInterval(iv); setTxDone(null); return 5 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [txDone])

  const oneAmt  = Number(amt) || 0
  const boneOut = oneAmt > 0 ? (oneAmt / YONE_RATE).toFixed(4) : '0.0000'
  const oneOut  = oneAmt > 0 ? (oneAmt * YONE_RATE).toFixed(4)  : '0.0000'

  const handleStakeClick = () => {
    if (oneAmt <= 0) return
    const yOut = (oneAmt / YONE_RATE).toFixed(4)
    onStake?.(oneAmt)
    setTxDone({ action: 'Staked', inAmt: oneAmt, inToken: 'ONE', outAmt: yOut, outToken: 'yONE' })
    setAmt('')
  }

  const handleUnstakeClick = () => {
    if (oneAmt <= 0) return
    const oOut = (oneAmt * YONE_RATE).toFixed(4)
    onUnstake?.(oneAmt)
    setTxDone({ action: 'Unstaked', inAmt: oneAmt, inToken: 'yONE', outAmt: oOut, outToken: 'ONE' })
    setAmt('')
  }

  const navigate = useNavigate()

  if (!connected) {
    navigate('/explore', { replace: true })
    return null
  }

  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 980, margin: '0 auto' }}>

      {/* ── Back breadcrumb ── */}
      <button onClick={() => navigate('/explore')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 20, padding: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = '#fff'}
        onMouseLeave={e => e.currentTarget.style.color = C.muted}>
        <IcoBack /> Explore
      </button>

      {/* ── Portfolio + APY header ── */}
      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${C.border}` }}>
          {/* Left — portfolio */}
          <div style={{ padding: '22px 26px', borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>Your Portfolio</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BONEBadge size={40} />
              <div>
                <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: 'JetBrains Mono, monospace', color: connected ? '#fff' : C.muted }}>
                  {connected ? walletYONE.toFixed(2) : '—'} <span style={{ fontSize: 18, color: C.green }}>yONE</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                  ≈ {connected ? (walletYONE * YONE_RATE).toFixed(2) : '—'} ONE
                </div>
              </div>
            </div>
          </div>
          {/* Right — APY */}
          <div style={{ padding: '22px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                Current APY <Tip text="Auto-compounded yield from liquidation gains, net of swap costs. Period affects the annualisation window." />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['7D','30D','All'].map(p => (
                  <button key={p} onClick={() => setApyPeriod(p)} style={{
                    padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                    background: apyPeriod === p ? C.teal : C.raised,
                    color: apyPeriod === p ? C.bg : C.muted,
                    transition: 'all 0.15s',
                  }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: C.green, fontFamily: 'JetBrains Mono, monospace' }}>
              {apyByPeriod[apyPeriod]}
            </div>
          </div>
        </div>
        {/* yONE exchange rate strip */}
        <div style={{ padding: '10px 26px', display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(16,185,129,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
            <BONEBadge size={18} />
            <span>1 yONE</span>
            <span style={{ color: C.border }}>≡</span>
            <ONEMark size={18} />
            <span style={{ color: '#fff', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{YONE_RATE.toFixed(4)} ONE</span>
          </div>
          <div style={{ width: 1, height: 14, background: C.border }} />
          <div style={{ fontSize: 12, color: C.muted }}>Rate increases as external strategy yield and liquidation gains compound</div>
        </div>
      </Card>

      {/* ── Feature highlights ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { icon: '⚡', label: 'Instant Unlock' },
          { icon: '∞', label: 'Zero Cooldown' },
          { icon: '↻', label: 'Auto-Compounding' },
          { icon: '🔒', label: 'yONE as Collateral' },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', borderRadius: 100, background: C.raised, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, color: C.muted }}>
            <span style={{ fontSize: 13 }}>{f.icon}</span>
            {f.label}
          </div>
        ))}
      </div>

      {/* ── Full-width states: success or no-balance ── */}
      {txDone && (
        <Card style={{ padding: '52px 32px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${C.green}15`, border: `1px solid ${C.green}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="28" height="28" viewBox="0 0 22 22" fill="none"><path d="M4 11l5 5 9-9" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', marginBottom: 10 }}>{txDone.action}</div>
          <div style={{ fontSize: 15, color: '#7ababa', marginBottom: 32 }}>
            {txDone.inAmt} {txDone.inToken} → {txDone.outAmt} {txDone.outToken}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Btn label="Stake more" color="primary" onClick={() => { setTxDone(null); setTab('Stake') }} />
            <Btn label="Unstake" color="ghost" onClick={() => { setTxDone(null); setTab('Unstake') }} />
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: '#3a6060' }}>Returning in {txCountdown}s…</div>
        </Card>
      )}

      {/* ── 2-column: widget left, stats right ── */}
      {!txDone && <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>

        {/* ── Stake / Unstake widget ── */}
        <Card style={{ padding: 32 }}>
          <TabBar tabs={['Stake', 'Unstake']} active={tab} onChange={t => { setTab(t); setAmt('') }} />
          <div style={{ marginTop: 24 }}>
            {tab === 'Stake' && walletONE <= 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px 16px' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                  <ONEMark size={28} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 10 }}>No ONE in your wallet</div>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>
                  Buy ONE with USDCx on DVP Exchange — instant swap, 1:1 rate, no fee.
                </div>
                <Btn label="Go to DVP Exchange →" color="primary" onClick={() => navigate('/explore')} />
              </div>
            ) : tab === 'Stake' ? (
                  <>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 10 }}>You're sending</div>
                    <div style={{ position: 'relative', marginBottom: 18 }}>
                      <AmountInput
                        value={amt} onChange={setAmt}
                        max={walletONE} unit="ONE"
                        usdValue={amt ? `≈ $${Number(amt).toFixed(2)}` : '$0.00'}
                        hint={`Balance: ${walletONE.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ONE`}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 10 }}>You receive</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', background: C.raised, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 20 }}>
                      <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'JetBrains Mono, monospace', color: C.green }}>{boneOut}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BONEBadge size={24} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>yONE</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: 'rgba(16,185,129,0.06)', border: `1px solid rgba(16,185,129,0.15)`, borderRadius: 10, marginBottom: 24, fontSize: 12 }}>
                      <span style={{ color: C.muted }}>1 yONE equals</span>
                      <span style={{ fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>{YONE_RATE.toFixed(4)} ONE</span>
                    </div>
                    <Btn label={amt && oneAmt > 0 ? `Stake ${Number(amt).toLocaleString()} ONE` : 'Enter amount'} color="primary" full disabled={!amt || oneAmt <= 0 || oneAmt > walletONE} onClick={handleStakeClick} />
                    <div style={{ marginTop: 12, fontSize: 12, color: C.muted, textAlign: 'center' }}>
                      yONE is freely transferable across Canton DeFi
                    </div>
                  </>
            ) : (
                  <>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 10 }}>You're sending</div>
                    <div style={{ marginBottom: 18 }}>
                      <AmountInput
                        value={amt} onChange={setAmt}
                        max={walletYONE} unit="yONE"
                        usdValue={amt ? `≈ $${(Number(amt) * YONE_RATE).toFixed(2)}` : '$0.00'}
                        hint={`Balance: ${walletYONE.toFixed(4)} yONE`}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 10 }}>You receive</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', background: C.raised, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 20 }}>
                      <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'JetBrains Mono, monospace' }}>{oneOut}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ONEMark size={24} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.cyan }}>ONE</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: 'rgba(16,185,129,0.06)', border: `1px solid rgba(16,185,129,0.15)`, borderRadius: 10, marginBottom: 24, fontSize: 12 }}>
                      <span style={{ color: C.muted }}>1 yONE equals</span>
                      <span style={{ fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>{YONE_RATE.toFixed(4)} ONE</span>
                    </div>
                    {walletYONE <= 0
                      ? <div style={{ textAlign: 'center', padding: '8px 0 16px', fontSize: 13, color: C.muted }}>You have no yONE to unstake.</div>
                      : null}
                    <Btn label="Unstake yONE" color="ghost" full disabled={walletYONE <= 0 || !amt || oneAmt <= 0} onClick={handleUnstakeClick} />
                  </>
            )}
          </div>
        </Card>

        {/* ── Right column: stats + info ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Vault Stats */}
          <Card style={{ padding: 26 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Vault Stats</div>
            <Row label="Total Staked" value="820,000 ONE" tip="Total ONE value staked across all yONE holders" />
            <Row label="yONE Supply" value="756,104 yONE" tip="Total yONE in circulation — each represents a growing share of the vault" />
            <Row label="Current APY" value="21.26%" highlight={C.green} tip="30-day annualised yield from external strategies and liquidation gains" noBorder />
          </Card>

          {/* Yield sources info */}
          <Card style={{ padding: 26 }}>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Yield Sources</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `${C.teal}15`, border: `1px solid ${C.teal}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>↗</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>External Strategies</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Idle ONE deployed into vetted yield strategies. Returns compound into the vault rate.</div>
                </div>
              </div>
              <div style={{ height: 1, background: C.border }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `${C.green}12`, border: `1px solid ${C.green}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>⚡</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Liquidation Gains</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Vault absorbs undercollateralized debt at a discount. CC collateral auto-converts to ONE and compounds.</div>
                </div>
              </div>
            </div>
          </Card>

        </div>

      </div>}
    </div>
  )
}

// ─── ONE TOKEN PAGE ───────────────────────────────────────────────────────────

function TokenPage() {
  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 36, padding: '28px 32px', background: `linear-gradient(135deg, rgba(20,184,166,0.08), rgba(6,182,212,0.05))`, border: `1px solid ${C.teal}22`, borderRadius: 20 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(20,184,166,0.15)', border: `2px solid ${C.teal}44`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ONEMark size={40} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Canton Network · Stablecoin</div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em' }}><span className="grad-text">ONE</span> <span style={{ color: '#fff' }}>— Alpend Stablecoin</span></div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Overcollateralized · Pegged 1:1 to USD · Minted by CC vaults</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.04em' }}>$1.0003</div>
          <div style={{ fontSize: 12, color: C.green, marginTop: 3 }}>On peg ✓</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Supply</div>
          <Row label="Circulating Supply" value="2,184,000 ONE" mono />
          <Row label="Market Cap" value="$2,184,654" mono />
          <Row label="All-Time High" value="$1.0041" mono />
          <Row label="All-Time Low" value="$0.9958" mono />
          <Row label="Active Vaults" value="347" />
          <Row label="Avg Collateral Ratio" value="195.6%" highlight={C.green} />
        </Card>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 16, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Peg Mechanics</div>
          <Row label="Current Price" value="$1.0003" mono highlight={C.teal} />
          <Row label="7d High / Low" value="$1.0012 / $0.9991" mono />
          <Row label="Vault TVL" value="820,000 ONE equiv." />
          <Row label="Pool APY" value="21.26%" highlight={C.green} />
          <Row label="Redemption Fee" value="0.50%" />
          <Row label="Min Collateral Ratio" value="110%" />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { k: 'Origination Fee', v: `${(MINT_FEE_PCT*100).toFixed(2)}%`, desc: 'One-time fee charged on each mint — like a loan origination fee', color: C.amber },
          { k: 'Annual Interest', v: `${INTEREST_RATE}%`,  desc: 'Ongoing interest accruing on your outstanding ONE debt per year', color: C.cyan },
          { k: 'Liq. Penalty',   v: '10%',                desc: 'Bonus CC paid to liquidators who keep the protocol solvent', color: C.red },
          { k: 'Reserve',        v: `${LIQ_RESERVE} ONE`,  desc: 'Held per vault on open, fully refunded when you close', color: C.teal },
        ].map(p => (
          <Card key={p.k} style={{ padding: 22, textAlign: 'center', background: `linear-gradient(145deg, ${C.surf}, ${C.raised})` }}>
            <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>{p.k}</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: p.color, marginBottom: 6 }}>{p.v}</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{p.desc}</div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── OPEN VAULT PAGE ──────────────────────────────────────────────────────────

function OpenVaultPage({ onOpen, walletCC }) {
  const navigate   = useNavigate()
  const [cc, setCC]   = useState('')
  const [mint, setMint] = useState('')

  const borrowAmt = Number(mint) || 0
  const feeONE    = borrowAmt > 0 ? (borrowAmt * MINT_FEE_PCT).toFixed(2) : '0.00'
  const totalDebt = borrowAmt > 0 ? (borrowAmt + Number(feeONE) + LIQ_RESERVE).toFixed(2) : String(LIQ_RESERVE)
  const risk      = useMemo(() => computeRisk(Number(cc), Number(totalDebt)), [cc, totalDebt])
  const maxMint   = cc ? Math.max(0, Math.floor((Number(cc) * CC_PRICE * (MAX_LTV / 100) - LIQ_RESERVE) / (1 + MINT_FEE_PCT))) : 0

  const ccNum    = Number(cc)
  const mintNum  = Number(mint)
  const belowMin = mintNum > 0 && mintNum < MIN_DEBT
  const ready    = ccNum >= 1 && ccNum <= walletCC && mintNum >= MIN_DEBT

  const handleSubmit = () => {
    if (!ready) return
    onOpen({ ccAmount: ccNum, borrowAmount: borrowAmt, oneDebt: Number(totalDebt) })
    navigate('/vault')
  }

  return (
    <div className="fade-in" style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <button onClick={() => navigate('/vault')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 13, padding: 0 }}>
          <IcoBack /> Back
        </button>
        <span style={{ color: C.border }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Open CC Vault</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Left: inputs */}
        <Card style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CCCoinBadge size={40} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Open CC Vault</div>
              <div style={{ fontSize: 12, color: C.muted }}>Deposit CC · Borrow ONE stablecoin</div>
            </div>
          </div>

          <AmountInput
            label="How much CC to deposit?"
            value={cc} onChange={setCC}
            max={walletCC} unit="CC"
            usdValue={cc ? `$${(ccNum * CC_PRICE).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD collateral` : '$0.00'}
            hint={`Wallet: ${walletCC.toLocaleString()} CC`}
            subHint={`Wallet: ${walletCC.toLocaleString()} CC`}
          />

          <AmountInput
            label={`How much ONE to borrow? (min ${MIN_DEBT} ONE)`}
            value={mint} onChange={setMint}
            max={maxMint} unit="ONE"
            usdValue={mint ? `≈ $${mintNum.toFixed(2)}` : '$0.00'}
            subHint={cc ? `Max ${maxMint.toLocaleString()} ONE at ${MAX_LTV}% LTV` : 'Enter deposit amount first'}
          />

          {belowMin && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#f87171' }}>
              Minimum borrow is {MIN_DEBT} ONE.
            </div>
          )}

          {mintNum >= MIN_DEBT && (
            <div style={{ background: C.raised, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
              <Row label="You receive" value={`${mint} ONE`} tip="This exact amount lands in your wallet" />
              <Row label={`Origination Fee (+${(MINT_FEE_PCT*100).toFixed(2)}%)`} value={`+${feeONE} ONE`} highlight={C.amber} tip="Added to your debt — not deducted from payout" />
              <Row label={`Fixed Interest (${INTEREST_RATE}% p.a.)`} value="Locked at opening" highlight={C.amber} tip="Fixed at vault open, never changes. Accrues on total debt." />
              <Row label="Liq. Reserve" value={`+${LIQ_RESERVE} ONE`} tip="Held by protocol, fully refunded when you close the vault" />
              <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Total debt</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.cyan, fontFamily: 'JetBrains Mono, monospace' }}>{totalDebt} ONE</span>
              </div>
            </div>
          )}

          <Btn
            label={ready ? 'Open Vault' : belowMin ? `Min ${MIN_DEBT} ONE required` : 'Enter amounts to continue'}
            color="primary" full size="lg" disabled={!ready}
            onClick={handleSubmit}
          />
        </Card>

        {/* Right: live risk preview */}
        <Card style={{ padding: 28, background: C.raised }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <IcoShield /> Live Risk Preview
          </div>
          <RiskPanel risk={risk} />
          {!cc && (
            <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 12, background: C.surf, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 8 }}>How vaults work</div>
              {[
                'Lock CC as collateral in your vault',
                `Borrow ONE at up to ${MAX_LTV}% LTV — 1 ONE = $1 USD`,
                `One-time ${(MINT_FEE_PCT*100).toFixed(2)}% origination fee on each borrow`,
                `${INTEREST_RATE}% p.a. interest, fixed and locked at vault opening`,
                `Repay ONE any time · keep LTV below ${LIQ_LTV}% to stay safe`,
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
                  <span style={{ color: C.teal, fontWeight: 700, marginTop: 1 }}>{i + 1}.</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>
    </div>
  )
}

// ─── ONE WALLET (EXPLORE) ─────────────────────────────────────────────────────

const DVP_RATE      = 1.0
const DVP_FEE_PCT   = 0
const MOCK_ADDR     = '0x4f2e9a8c3d1b7f05e82c1a4d6b3e9f2a7c8d91b'
const MOCK_ADDR_SHORT = '0x4f2e…91b'

const EXPLORER_BASE = 'https://ccview.io/transactions'

const WALLET_HISTORY = [
  // ── ONE Wallet / DVP ──
  { id: 2,  date: 'May 13, 2026 · 16:05', type: 'Swap',            icon: 'swap',     app: null,      amount: '+850.00 ONE',    usd: '+$850.00',   detail: 'From 852.55 USDCx · DVP',             hash: '0x9c3e7a2f5b8d1e4a7c0f3b6d9e2a5c8f1b4e7a0d3f6c9b2e5a8d1f4c7b0e3a6d9' },
  { id: 3,  date: 'May 13, 2026 · 09:18', type: 'Staked',          icon: 'stake',    app: null,      amount: '-500.00 ONE',    usd: '-$500.00',   detail: '→ 461.00 yONE · Vault',               hash: '0x1a3d5f7b9e2c4a6d8f0b2e4c6a8d0f2b4e6c8a0d2f4b6e8c0a2d4f6b8e0c2a4d6f8' },
  { id: 4,  date: 'May 12, 2026 · 15:30', type: 'Swap',            icon: 'swap',     app: null,      amount: '+347.32 ONE',    usd: '+$347.32',   detail: 'From 350 USDCx · DVP',                hash: '0x2b5e8a1d4f7c0b3e6a9d2f5c8b1e4a7d0f3c6a9b2e5d8f1c4b7e0a3d6f9c2b5e8' },
  { id: 5,  date: 'May 11, 2026 · 14:40', type: 'Unstaked',        icon: 'unstake',  app: null,      amount: '+108.47 ONE',    usd: '+$108.47',   detail: '← 100.00 yONE redeemed · Vault',      hash: '0x2b4d6f8a0c2e4f6b8d0a2c4e6f8b0d2a4c6e8f0b2d4f6a8c0e2a4d6f8b0c2e4f6a8' },
  { id: 6,  date: 'May 11, 2026 · 11:05', type: 'Raven Markets',   icon: 'app',      app: 'raven',   amount: '-150.00 ONE',    usd: '-$150.00',   detail: 'Trade settlement',                    hash: '0x7d0f3a6c9b2e5d8f1a4e7c0b3d6f9a2c5b8e1a4d7f0c3b6e9a2d5f8c1b4e7a0d3' },
  { id: 8,  date: 'May 09, 2026 · 17:20', type: 'Swap',            icon: 'swap',     app: null,      amount: '-299.10 ONE',    usd: '-$299.10',   detail: 'To 300 USDCx · DVP',                  hash: '0x6a9d2f5c8b1e4a7d0f3c6b9e2a5f8c1b4e7a0d3f6c9b2e5d8f1c4a7b0e3d6f9a2' },
  { id: 10, date: 'May 08, 2026 · 13:55', type: 'FractIt',         icon: 'app',      app: 'fract',   amount: '-80.00 ONE',     usd: '-$80.00',    detail: 'Asset purchase',                      hash: '0x3c6f9a2e5b8d1f4a7c0e3b6d9f2a5c8e1b4d7f0a3e6c9b2f5d8a1e4c7b0d3f6a9' },
  // ── Alpend Market ──
  { id: 14, date: 'May 06, 2026 · 14:22', type: 'Supplied',        icon: 'supply',   app: 'market',  amount: '-1,000.00 ONE',  usd: '-$1,000.00', detail: 'ONE pool · Alpend Market',             hash: '0x5d8a1e4c7b0f3a6d9e2c5b8f1a4d7c0e3b6f9a2e5c8b1d4f7a0e3c6b9f2a5d8e1' },
  { id: 15, date: 'May 05, 2026 · 12:05', type: 'Borrowed',        icon: 'borrow',   app: 'market',  amount: '+400.00 ONE',    usd: '+$400.00',   detail: 'Against CC collateral · Alpend Market',hash: '0x6e9c3f7a1b5d9e3f7a1b5d9e3f7a1b5d9e3f7a1b5d9e3f7a1b5d9e3f7a1b5d9e3f' },
  { id: 16, date: 'May 05, 2026 · 10:10', type: 'FractIt',         icon: 'app',      app: 'fract',   amount: '-50.00 ONE',     usd: '-$50.00',    detail: 'Asset purchase',                      hash: '0xa2e5c8b1d4f7a0e3c6b9f2d5a8e1c4b7f0a3d6c9b2e5f8a1d4c7e0b3f6a9d2e5c8' },
  { id: 17, date: 'May 04, 2026 · 17:30', type: 'Withdrawn',       icon: 'withdraw', app: 'market',  amount: '+250.00 ONE',    usd: '+$250.00',   detail: 'From ONE pool · Alpend Market',        hash: '0x7f0d4a8c2e6f0d4a8c2e6f0d4a8c2e6f0d4a8c2e6f0d4a8c2e6f0d4a8c2e6f0d4a' },
  { id: 18, date: 'May 04, 2026 · 15:33', type: 'Raven Markets',   icon: 'app',      app: 'raven',   amount: '+320.00 ONE',    usd: '+$320.00',   detail: 'Trade proceeds received',              hash: '0xd7f0a3e6c9b2d5f8a1e4b7c0f3a6d9e2b5c8f1a4e7b0d3c6f9a2e5b8d1f4c7a0e3' },
  { id: 19, date: 'May 03, 2026 · 11:15', type: 'Debt Repaid',     icon: 'repay',    app: 'market',  amount: '-400.00 ONE',    usd: '-$400.00',   detail: 'Full repayment · Alpend Market',       hash: '0x8a1e5c9d3f7b1e5c9d3f7b1e5c9d3f7b1e5c9d3f7b1e5c9d3f7b1e5c9d3f7b1e5c' },
]

function TxTypeChip({ type, icon }) {
  const cfg = {
    receive:  { color: C.green,  bg: 'rgba(16,185,129,0.1)',   label: 'Received'  },
    mint:     { color: C.teal,   bg: 'rgba(20,184,166,0.1)',   label: 'Minted'    },
    swap:     { color: C.cyan,   bg: 'rgba(6,182,212,0.1)',    label: 'Swap'      },
    send:     { color: C.muted,  bg: 'rgba(122,181,181,0.08)', label: 'Sent'      },
    app:      { color: C.amber,  bg: 'rgba(245,158,11,0.1)',   label: 'App'       },
    stake:    { color: C.green,  bg: 'rgba(16,185,129,0.1)',   label: 'Staked'    },
    unstake:  { color: C.muted,  bg: 'rgba(122,181,181,0.08)', label: 'Unstaked'  },
    vault:    { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', label: 'Vault'     },
    supply:   { color: C.teal,   bg: 'rgba(20,184,166,0.1)',   label: 'Supplied'  },
    withdraw: { color: C.muted,  bg: 'rgba(122,181,181,0.08)', label: 'Withdrawn' },
    borrow:   { color: C.cyan,   bg: 'rgba(6,182,212,0.1)',    label: 'Borrowed'  },
    repay:    { color: C.amber,  bg: 'rgba(245,158,11,0.1)',   label: 'Repaid'    },
  }
  const c = cfg[icon] || cfg.send
  return (
    <span style={{ padding: '3px 10px', borderRadius: 100, background: c.bg, border: `1px solid ${c.color}33`, fontSize: 11, fontWeight: 700, color: c.color, whiteSpace: 'nowrap' }}>
      {type}
    </span>
  )
}

function USDCxBadge({ size = 20 }) {
  return <img src="/usdc.svg" width={size} height={size} style={{ borderRadius: '50%', flexShrink: 0, display: 'block' }} alt="USDCx" />
}

function ExplorePage({ walletONE = 0, walletYONE = 0, walletConnected, onWalletConnect, onDisconnect, onWalletSwap }) {
  const navigate    = useNavigate()
  const [tab,         setTab]       = useState('Swap')
  const [swapDir,     setSwapDir]   = useState('USDC_TO_ONE')
  const [swapAmt,     setSwapAmt]   = useState('')
  const [swapDone,    setSwapDone]  = useState(false)
  const [lastSwap,    setLastSwap]  = useState(null)  // { amt, from, to, hash } for success screen
  const [swapCountdown, setSwapCountdown] = useState(7)
  const [histFilter,     setHistFilter]     = useState('All')
  const [walletUSDCx,    setWalletUSDCx]    = useState(1000.00)
  const [localTxns,      setLocalTxns]      = useState([])
  const [authState,      setAuthState]      = useState('idle') // 'idle' | 'checking' | 'denied'
  const [demoPass,       setDemoPass]       = useState(true)   // demo toggle: pass = whitelisted
  const swapInputRef = useRef(null)

  useEffect(() => {
    if (!swapDone) { setSwapCountdown(7); return }
    setSwapCountdown(7)
    const interval = setInterval(() => {
      setSwapCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setSwapDone(false); setSwapAmt(''); setLastSwap(null)
          return 7
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [swapDone])

  // Reset auth state when wallet disconnects (e.g. via nav logout)
  const prevConnected = useRef(walletConnected)
  if (prevConnected.current !== walletConnected) {
    prevConnected.current = walletConnected
    if (!walletConnected && authState !== 'idle') setAuthState('idle')
  }

  const handleConnect = () => {
    setAuthState('checking')
    // Connect Loop immediately so nav shows address pill during check
    onWalletConnect()
    setTimeout(() => {
      if (demoPass) setAuthState('idle')   // approved — show dashboard
      else          setAuthState('denied') // denied — show restricted screen
    }, 1400)
  }

  const handleDisconnect = () => {
    setAuthState('idle')
    onDisconnect()
  }

  const swapNum   = Number(swapAmt) || 0
  const swapMax   = swapDir === 'ONE_TO_USDC' ? walletONE : walletUSDCx
  const fromToken = swapDir === 'ONE_TO_USDC' ? 'ONE'   : 'USDCx'
  const toToken   = swapDir === 'ONE_TO_USDC' ? 'USDCx' : 'ONE'
  const swapPct    = swapMax > 0 ? Math.min((swapNum / swapMax) * 100, 100) : 0
  const isOverMax  = swapNum > 0 && swapNum > swapMax

  const handleSwapConfirm = () => {
    const isToONE = swapDir === 'USDC_TO_ONE'
    if (isToONE) {
      setWalletUSDCx(prev => Math.max(0, prev - swapNum))
      onWalletSwap(swapNum)
    } else {
      setWalletUSDCx(prev => prev + swapNum)
      onWalletSwap(-swapNum)
    }
    const newHash = '0x' + Array.from({length: 64}, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
    setLastSwap({ amt: swapNum, from: fromToken, to: toToken, hash: newHash })
    setLocalTxns(prev => [{
      id: Date.now(),
      date: 'Just now',
      type: 'Swap',
      icon: 'swap',
      app: null,
      amount: isToONE ? `+${swapNum.toFixed(2)} ONE` : `-${swapNum.toFixed(2)} ONE`,
      usd:    isToONE ? `+$${swapNum.toFixed(2)}` : `-$${swapNum.toFixed(2)}`,
      detail: isToONE ? `From ${swapAmt} USDCx · DVP` : `To ${swapNum.toFixed(2)} USDCx · DVP`,
      hash: newHash,
    }, ...prev])
    setSwapDone(true)
  }

  const histFilters = ['All', 'Swap', 'Stake', 'App']
  const allTxns = [...localTxns, ...WALLET_HISTORY]
  const filteredHist = allTxns.filter(tx => {
    if (histFilter === 'All')   return true
    if (histFilter === 'Swap')  return tx.icon === 'swap'
    if (histFilter === 'Stake') return tx.icon === 'stake' || tx.icon === 'unstake'
    if (histFilter === 'App')   return tx.icon === 'app' || tx.icon === 'vault' || tx.icon === 'supply' || tx.icon === 'withdraw' || tx.icon === 'borrow' || tx.icon === 'repay'
    return true
  })

  const SOON_TABS = ['Send', 'Receive']

  if (authState === 'checking' || authState === 'denied' || !walletConnected) {
    // card shared style (alpend-app)
    const authCard = { background: 'linear-gradient(160deg, #0e2e2e, #0a2424)', border: '1px solid #163838', boxShadow: '0 0 60px #14b8a610, 0 20px 60px #00000060', borderRadius: 16, padding: '32px 28px', width: '100%', textAlign: 'center' }
    const authIconBox = { width: 56, height: 56, borderRadius: 16, background: '#0d2828', border: '1px solid #1e4040', boxShadow: '0 0 20px #14b8a615', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: C.teal }
    const BounceDots = () => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.teal, animation: `a-bounce 1.3s ease-in-out ${i * 0.18}s infinite` }} />)}
      </div>
    )

    // ── Checking (whitelist API in progress) ──
    if (authState === 'checking') {
      return (
        <div className="fade-in app-bg" style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ ...authCard, maxWidth: 360 }}>
            <div style={authIconBox}><IcoSpinner size={22} /></div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Checking your status</p>
            <p style={{ fontSize: 12, color: '#7ababa', marginBottom: 28 }}>Verifying your whitelist access…</p>
            <BounceDots />
          </div>
        </div>
      )
    }

    // ── Denied (not whitelisted) ──
    if (authState === 'denied') {
      const partners = [
        { name: 'Raven Markets', cat: 'Options',      desc: 'Trade digital options on crypto assets with fixed payouts and no liquidations.', emoji: '🦅', url: 'https://app.raven.market'      },
        { name: 'FractIt',       cat: 'Real Estate',  desc: 'On-chain real estate index markets. Trade tokenized property baskets 24/7.',      emoji: '⬡', url: 'https://markets.fractit.com'  },
        { name: 'Alpend Market', cat: 'Money Market', desc: 'Decentralized lending and borrowing on Canton Network. Confidential by design.',   emoji: '▲', url: 'https://market.alpend.com'    },
      ]
      return (
        <div className="fade-in app-bg" style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ ...authCard, maxWidth: 580 }}>
            <div style={{ ...authIconBox, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', boxShadow: 'none', color: C.red }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Access Restricted</p>
            <p style={{ fontSize: 13, color: '#7ababa', lineHeight: 1.7, maxWidth: 400, margin: '0 auto 28px' }}>
              Your Loop wallet is connected but not yet whitelisted for ONE Wallet. Get whitelisted through any partner app below to unlock access.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24, textAlign: 'left' }}>
              {partners.map(p => (
                <div key={p.name}
                  onClick={() => window.open(p.url, '_blank')}
                  style={{ background: '#071818', border: '1px solid #1e4040', borderRadius: 12, padding: 14, cursor: 'pointer', transition: 'border-color 0.18s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${C.teal}55`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#1e4040'}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 20 }}>{p.emoji}</div>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.teal, background: `${C.teal}12`, border: `1px solid ${C.teal}30`, borderRadius: 100, padding: '3px 7px' }}>{p.cat}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 5 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#4a7878', lineHeight: 1.6, marginBottom: 10 }}>{p.desc}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.teal }}>Get whitelisted →</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: '#4a7878', marginBottom: 20, lineHeight: 1.6 }}>
              Once any partner app whitelists you, return here to access your ONE Wallet.
            </p>
            <button onClick={handleDisconnect} style={{ padding: '8px 22px', borderRadius: 100, border: '1px solid #1e4040', background: 'transparent', color: '#7ababa', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.red}55`; e.currentTarget.style.color = C.red }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e4040'; e.currentTarget.style.color = '#7ababa' }}>
              Disconnect Loop Wallet
            </button>
          </div>
        </div>
      )
    }

    // ── Idle (connect screen) ──
    return (
      <div className="fade-in" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', background: '#071e1e', overflowY: 'auto' }}>

        {/* Brand header bar — ONE logo top-left */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, height: 56, display: 'flex', alignItems: 'center', padding: '0 32px' }}>
          <img src="/one-logo.webp" alt="ONE" style={{ height: 30, width: 'auto', display: 'block' }} />
        </div>

        {/* Soft central bloom — fixed so it covers viewport */}
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 700, height: 500, borderRadius: '50%', background: 'radial-gradient(ellipse, #14b8a60a 0%, transparent 70%)', pointerEvents: 'none', zIndex: 1 }} />

        {/* Alpend A watermark — fixed viewport-centered */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -48%)', width: 'min(820px, 92vw)', aspectRatio: '333 / 287' }}>
            <svg viewBox="0 0 333 287" width="100%" height="100%" fill="#14b8a6" style={{ opacity: 0.038, display: 'block' }}>
              <path d={A_PATH} />
            </svg>
          </div>
        </div>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px 24px', position: 'relative', zIndex: 2, textAlign: 'center' }}>
          <div style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* ONE coin mark */}
            <div style={{ position: 'relative', display: 'inline-flex', marginBottom: 28 }}>
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '1px solid #14b8a620', animation: 'a-pulse 2.4s ease-in-out infinite' }} />
              <div style={{ position: 'absolute', inset: -22, borderRadius: '50%', border: '1px solid #14b8a60c', animation: 'a-pulse 2.4s ease-in-out 0.8s infinite' }} />
              <img src="/one-token.webp" width={68} height={68} alt="ONE" style={{ display: 'block', borderRadius: '50%', boxShadow: '0 0 28px #14b8a635, 0 0 56px #14b8a614' }} />
            </div>

            {/* Headline */}
            <h1 style={{ margin: '0 0 8px', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', fontSize: 'clamp(1.6rem, 7vw, 2.6rem)', textAlign: 'center', width: '100%' }}>
              <span style={{ color: '#fff' }}>ONE.</span>
            </h1>
            <div style={{ fontSize: 'clamp(1rem, 3.5vw, 1.25rem)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 20, background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 60%, #14b8a6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', textAlign: 'center', width: '100%' }}>
              Your Gateway to Canton DeFi.
            </div>

            {/* Feature pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 36, flexWrap: 'wrap' }}>
              {[['$1.00 Peg', C.teal], ['Atomic DVP', '#8b5cf6'], ['Confidential', '#06b6d4']].map(([label, color]) => (
                <span key={label} style={{ fontSize: 11, fontWeight: 600, color, background: color + '10', border: `1px solid ${color}28`, borderRadius: 100, padding: '5px 12px', letterSpacing: '0.01em' }}>{label}</span>
              ))}
            </div>

            {/* CTA */}
            <div style={{ marginBottom: 8 }}>
              <button onClick={handleConnect} className="hero-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 16, padding: '7px 7px 7px 28px', borderRadius: 100, background: '#071e1e', border: '1px solid #1e4040', cursor: 'pointer' }}>
                <span className="hero-cta-fill" />
                <span className="hero-cta-label" style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', position: 'relative', zIndex: 1 }}>Get Started</span>
                <span className="hero-cta-circle" style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', zIndex: 1 }}>
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="hero-cta-arrow">
                    <path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#4a7878', marginTop: 16 }}>Log in via Loop to continue</p>

            {/* Network badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 28, padding: '6px 14px', borderRadius: 100, background: '#0d2828', border: '1px solid #163838', color: '#7ababa', fontSize: 12, letterSpacing: '0.02em' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.teal, flexShrink: 0, animation: 'a-pulse 2.4s ease-in-out infinite' }} />
              Canton Network · Mainnet v0.1
            </div>

            {/* Demo toggle */}
            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#1e3838' }}>demo: whitelist</span>
              <button onClick={() => setDemoPass(p => !p)} style={{ fontSize: 10, color: demoPass ? C.teal : C.red, border: `1px solid ${demoPass ? C.teal + '30' : C.red + '30'}`, borderRadius: 100, padding: '2px 8px', background: 'transparent', cursor: 'pointer' }}>
                {demoPass ? 'PASS' : 'FAIL'}
              </button>
            </div>

          </div>
        </main>
      </div>
    )
  }

  const isNewUser = walletONE === 0

  // Shared dark card style (alpend-app)
  const card = { background: '#071818', border: '1px solid #1e4040', borderRadius: 14 }
  const inputBox = { background: '#071818', border: '1px solid #0d2424', borderRadius: 12, padding: '14px 16px' }

  return (
    <div className="fade-in" style={{
      minHeight: 'calc(100vh - 56px)',
      padding: '28px 28px 60px',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* ── BALANCE HERO ── */}
        <div style={{ ...card, padding: '28px 32px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 11, color: '#4a7878', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Your Balance</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <ONEMark size={52} />
                <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                  {walletONE.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.teal, letterSpacing: '-0.02em' }}>ONE</div>
              </div>
              <div style={{ fontSize: 14, color: '#7ababa', marginTop: 6 }}>
                ≈ ${walletONE.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {walletUSDCx > 0 ? (
              <div style={{ background: '#071818', border: `1px solid ${isNewUser ? C.teal + '33' : '#1a3535'}`, borderRadius: 12, padding: '14px 18px', minWidth: 230 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <USDCxBadge size={16} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: isNewUser ? '#fff' : '#7ababa' }}>
                      {walletUSDCx.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDCx
                    </span>
                  </div>
                  <button onClick={() => setWalletUSDCx(0)} style={{ fontSize: 10, color: '#3a6060', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>✕ demo</button>
                </div>
                <div style={{ fontSize: 12, color: isNewUser ? '#7ababa' : '#3a6060', lineHeight: 1.5, marginBottom: isNewUser ? 10 : 0 }}>
                  {isNewUser ? 'Swap to ONE to get started — 1:1, no fee' : 'Available to swap · 1:1, no fee'}
                </div>
                {isNewUser && (
                  <button onClick={() => { const el = document.getElementById('dvp-panel'); el?.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => swapInputRef.current?.focus(), 350) }}
                    style={{ fontSize: 12, fontWeight: 700, color: C.teal, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Swap now ↓
                  </button>
                )}
              </div>
            ) : (
              <div style={{ background: `linear-gradient(135deg, rgba(20,184,166,0.07) 0%, rgba(6,182,212,0.04) 100%)`, border: `1px solid ${C.teal}44`, borderRadius: 12, padding: '14px 18px', minWidth: 230 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <USDCxBadge size={16} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>0.00 USDCx</span>
                  </div>
                  <button onClick={() => setWalletUSDCx(1000)} style={{ fontSize: 10, color: '#3a6060', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>+ demo</button>
                </div>
                <div style={{ fontSize: 12, color: '#7ababa', lineHeight: 1.55, marginBottom: 10 }}>
                  Add USDCx to your Loop wallet to get started.
                </div>
                <a href="https://tradecraft.fi" target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#fff', background: C.teal, padding: '6px 12px', borderRadius: 7, textDecoration: 'none', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  Get USDCx on Tradecraft.fi <IcoArrow />
                </a>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => { const el = document.getElementById('dvp-panel'); el?.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => swapInputRef.current?.focus(), 350) }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 100, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'opacity 0.15s',
                background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)', color: '#071e1e',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <IcoSwapH /> Swap
            </button>
            <button onClick={() => navigate('/earn')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 100, background: 'transparent', color: '#7ababa', fontWeight: 700, fontSize: 13, border: '1px solid #1e4040', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.teal}55`; e.currentTarget.style.color = C.teal }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e4040'; e.currentTarget.style.color = '#7ababa' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              Stake
            </button>
            <button onClick={() => document.getElementById('ecosystem')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 100, background: 'transparent', color: '#7ababa', fontWeight: 700, fontSize: 13, border: '1px solid #1e4040', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.teal}55`; e.currentTarget.style.color = C.teal }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e4040'; e.currentTarget.style.color = '#7ababa' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="5" height="5" rx="1"/><rect x="8" y="1" width="5" height="5" rx="1"/><rect x="1" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/></svg>
              Apps
            </button>
          </div>
        </div>

        {/* ── yONE BANNER — promo when empty, position summary when staked ── */}
        <div onClick={() => navigate('/earn')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginBottom: 14, background: 'linear-gradient(135deg, #071e1e 0%, #0a2a2a 100%)', border: '1px solid #1a4040', borderRadius: 14, padding: '18px 24px', cursor: 'pointer', transition: 'border-color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#2a5050'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#1a4040'}>
          {/* Left — icon + text */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${C.green}12`, border: `1px solid ${C.green}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BONEBadge size={28} />
            </div>
            {walletYONE > 0 ? (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#4a7878', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Your Stake</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.03em', marginBottom: 2 }}>
                  {walletYONE.toFixed(2)} <span style={{ fontSize: 14, color: C.green }}>yONE</span>
                </div>
                <div style={{ fontSize: 12, color: '#4a7878' }}>≈ {(walletYONE * YONE_RATE).toFixed(2)} ONE · earning yield</div>
              </div>
            ) : (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Put your ONE to work</div>
                <div style={{ fontSize: 12, color: '#4a7878' }}>Auto-compounding yield · No lock-up · No cooldown</div>
              </div>
            )}
          </div>
          {/* Right — APY + CTA grouped together */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#4a7878', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Current APY</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: C.green, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.04em', lineHeight: 1 }}>21.26%</div>
            </div>
            <div style={{ width: 1, height: 32, background: '#1a4040' }} />
            <span style={{ color: C.green, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {walletYONE > 0 ? 'Manage →' : 'Stake ONE →'}
            </span>
          </div>
        </div>

        {/* ── DVP + ACTIVITY ROW ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 14, marginBottom: 14 }}>

          {/* DVP Swap Card */}
          <div id="dvp-panel" style={{ ...card, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>DVP Exchange</div>
                <div style={{ fontSize: 12, color: '#4a7878' }}>ONE ↔ USDCx · Canton Network</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: C.green, background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 100, padding: '3px 9px' }}>1:1 RATE</span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: C.teal, background: `${C.teal}12`, border: `1px solid ${C.teal}30`, borderRadius: 100, padding: '3px 9px' }}>NO FEE</span>
              </div>
            </div>

            {swapDone ? (
              <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${C.green}15`, border: `1px solid ${C.green}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="20" height="20" viewBox="0 0 22 22" fill="none"><path d="M4 11l5 5 9-9" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Swap Settled</div>
                <div style={{ fontSize: 13, color: '#7ababa', marginBottom: 20 }}>
                  {lastSwap?.amt.toFixed(2)} {lastSwap?.from} → {lastSwap?.amt.toFixed(2)} {lastSwap?.to}
                </div>
                {lastSwap?.hash && (
                  <div style={{ marginBottom: 20 }}>
                    <a href={`${EXPLORER_BASE}/${lastSwap.hash}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#4a7878', textDecoration: 'none', background: '#071e1e', border: '1px solid #1e4040', borderRadius: 8, padding: '6px 12px', transition: 'color 0.15s, border-color 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = C.teal; e.currentTarget.style.borderColor = `${C.teal}55` }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#4a7878'; e.currentTarget.style.borderColor = '#1e4040' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{lastSwap.hash.slice(0, 10)}…{lastSwap.hash.slice(-6)}</span>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </a>
                  </div>
                )}
                <button onClick={() => { setSwapDone(false); setSwapAmt(''); setLastSwap(null) }}
                  style={{ padding: '9px 28px', borderRadius: 100, background: 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#071e1e', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', marginBottom: 12 }}>
                  New Swap
                </button>
                <div style={{ fontSize: 11, color: '#3a6060' }}>Redirecting in {swapCountdown}s…</div>
              </div>
            ) : (
              <div>
                <div style={{ ...inputBox, marginBottom: 4, borderColor: isOverMax ? `${C.red}55` : inputBox.border }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#4a7878', textTransform: 'uppercase', letterSpacing: '0.09em' }}>From</span>
                    <span style={{ fontSize: 10, color: '#3a6060' }}>{fromToken === 'ONE' ? 'ONE wallet' : 'Loop wallet'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input ref={swapInputRef} type="number" value={swapAmt} onChange={e => setSwapAmt(e.target.value)} placeholder="0.00"
                      style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: isOverMax ? C.red : '#fff', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'JetBrains Mono, monospace', minWidth: 0 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#071e1e', borderRadius: 9, padding: '7px 12px', border: '1px solid #1e4040', flexShrink: 0 }}>
                      {fromToken === 'ONE' ? <ONEMark size={18} /> : <USDCxBadge size={18} />}
                      <span style={{ fontSize: 13, fontWeight: 700, color: fromToken === 'ONE' ? C.teal : '#7aadff' }}>{fromToken}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: isOverMax ? C.red : '#4a7878' }}>
                      {isOverMax ? `Exceeds balance by ${(swapNum - swapMax).toFixed(2)}` : `≈ $${swapNum.toFixed(2)}`}
                    </span>
                    <button onClick={() => setSwapAmt(String(swapMax))} style={{ fontSize: 11, fontWeight: 700, color: C.teal, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Max {swapMax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </button>
                  </div>
                  {swapAmt && (
                    <div style={{ marginTop: 10, height: 3, background: '#0d2424', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: isOverMax ? '100%' : `${swapPct}%`, background: isOverMax ? C.red : `linear-gradient(90deg, ${C.teal}, ${C.cyan})`, borderRadius: 2, transition: 'width 0.15s' }} />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                  <button onClick={() => { setSwapDir(d => d === 'ONE_TO_USDC' ? 'USDC_TO_ONE' : 'ONE_TO_USDC'); setSwapAmt('') }}
                    style={{ width: 34, height: 34, borderRadius: '50%', background: '#071e1e', border: '1px solid #1e4040', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.teal, transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#0a2424'; e.currentTarget.style.borderColor = C.teal }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#071e1e'; e.currentTarget.style.borderColor = '#1e4040' }}>
                    <IcoSwapH />
                  </button>
                </div>

                <div style={{ ...inputBox, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#4a7878', textTransform: 'uppercase', letterSpacing: '0.09em' }}>You receive (exact)</span>
                    <span style={{ fontSize: 10, color: '#3a6060' }}>→ {toToken === 'ONE' ? 'ONE wallet' : 'Loop wallet'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'JetBrains Mono, monospace', color: isOverMax ? '#2a5050' : swapNum > 0 ? C.teal : '#2a5050' }}>
                      {swapNum > 0 ? swapNum.toFixed(2) : '0.00'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#071e1e', borderRadius: 9, padding: '7px 12px', border: '1px solid #1e4040', flexShrink: 0 }}>
                      {toToken === 'ONE' ? <ONEMark size={18} /> : <USDCxBadge size={18} />}
                      <span style={{ fontSize: 13, fontWeight: 700, color: toToken === 'ONE' ? C.teal : '#7aadff' }}>{toToken}</span>
                    </div>
                  </div>
                </div>

                {swapNum > 0 && (
                  <div style={{ background: '#071e1e', border: '1px solid #0d2424', borderRadius: 10, padding: '11px 14px', marginBottom: 14 }}>
                    {[['Rate', '1.00 ONE = 1.00 USDCx', C.green], ['Fee', 'None', C.green], ['Settlement', 'Instant · Atomic · DVP', '#fff']].map(([label, val, color]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: '#4a7878' }}>{label}</span>
                        <span style={{ fontWeight: 700, color }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {swapDir === 'ONE_TO_USDC' && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)', borderRadius: 9, padding: '10px 13px', marginBottom: 14 }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="8" cy="8" r="7" stroke="#06b6d4" strokeWidth="1.5"/>
                      <path d="M8 7v4" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="8" cy="5" r="0.8" fill="#06b6d4"/>
                    </svg>
                    <span style={{ fontSize: 11, color: '#5a9ab0', lineHeight: 1.55 }}>
                      USDCx lives in your Loop wallet — it won't appear here. After this swap, check your Loop wallet to see the received USDCx.
                    </span>
                  </div>
                )}

                <button disabled={!swapAmt || swapNum <= 0 || isOverMax} onClick={handleSwapConfirm}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: isOverMax ? `1px solid ${C.red}40` : 'none', fontWeight: 700, fontSize: 14, transition: 'opacity 0.15s',
                    cursor: swapNum > 0 && !isOverMax ? 'pointer' : 'not-allowed',
                    background: isOverMax ? `${C.red}15` : swapNum > 0 ? 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' : '#0d2424',
                    color: isOverMax ? C.red : swapNum > 0 ? '#071e1e' : '#2a5050',
                  }}
                  onMouseEnter={e => { if (swapNum > 0 && !isOverMax) e.currentTarget.style.opacity = '0.88' }}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  {isOverMax ? `Insufficient balance · need ${(swapNum - swapMax).toFixed(2)} more` : swapNum > 0 ? `Swap ${swapNum.toFixed(2)} ${fromToken} → ${swapNum.toFixed(2)} ${toToken}` : 'Enter an amount'}
                </button>
              </div>
            )}
          </div>

          {/* Activity Card */}
          <div style={{ ...card, padding: 24, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Recent Activity</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {histFilters.map(f => (
                  <button key={f} onClick={() => setHistFilter(f)} style={{
                    padding: '3px 9px', borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer', transition: 'all 0.15s',
                    border: `1px solid ${histFilter === f ? C.teal + '55' : '#1e4040'}`,
                    background: histFilter === f ? `${C.teal}15` : 'transparent',
                    color: histFilter === f ? C.teal : '#4a7878',
                  }}>{f}</button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1 }}>
              {filteredHist.length === 0 ? (
                <EmptyState icon={<IcoSwapH />} title="No transactions yet" hint="Your swaps, sends, and receives will appear here." compact />
              ) : (() => {
                const LIMIT = 5
                const visible = filteredHist.slice(0, LIMIT)
                const appMeta = {
                  raven: { emoji: '🦅', bg: 'rgba(16,185,129,0.12)', color: C.green },
                  fract: { emoji: '⬡',  bg: 'rgba(99,102,241,0.12)', color: '#818cf8' },
                }
                return (
                  <>
                    {visible.map((tx, i) => {
                      const isApp = tx.icon === 'app' && tx.app
                      const meta  = isApp ? appMeta[tx.app] : null
                      return (
                        <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < visible.length - 1 ? '1px solid #0d2424' : 'none' }}>
                          <div style={{ width: 34, height: 34, borderRadius: isApp ? 9 : '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isApp ? meta.bg : ({ receive: `${C.green}18`, swap: `${C.teal}15`, send: '#1e4040' })[tx.icon] || '#1e4040',
                            color: isApp ? meta.color : ({ receive: C.green, swap: C.teal, send: '#4a7878' })[tx.icon] || '#4a7878',
                            fontSize: isApp ? 17 : undefined,
                          }}>
                            {isApp ? meta.emoji : tx.icon === 'receive' ? <IcoReceive /> : tx.icon === 'swap' ? <IcoSwapH /> : tx.icon === 'stake' ? '↑' : tx.icon === 'unstake' ? '↓' : tx.icon === 'vault' ? '◈' : tx.icon === 'supply' ? '+' : tx.icon === 'withdraw' ? '−' : tx.icon === 'borrow' ? '⬖' : tx.icon === 'repay' ? '✓' : <IcoSend />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                              {tx.type}
                              {tx.hash && (
                                <a href={`${EXPLORER_BASE}/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                                  style={{ color: '#2a4848', textDecoration: 'none', lineHeight: 1, transition: 'color 0.15s' }}
                                  onMouseEnter={e => e.currentTarget.style.color = C.teal}
                                  onMouseLeave={e => e.currentTarget.style.color = '#2a4848'}>
                                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </a>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#4a7878', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.date} · {tx.detail}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: tx.amount.startsWith('+') ? C.teal : '#fff' }}>{tx.amount}</div>
                            <div style={{ fontSize: 11, color: '#4a7878', marginTop: 1 }}>{tx.usd}</div>
                          </div>
                        </div>
                      )
                    })}
                    {filteredHist.length > LIMIT && (
                      <button onClick={() => navigate('/wallet/activity')} style={{ width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 8, border: '1px solid #1e4040', background: 'transparent', color: '#4a7878', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = C.teal; e.currentTarget.style.borderColor = `${C.teal}55` }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#4a7878'; e.currentTarget.style.borderColor = '#1e4040' }}>
                        See all · {filteredHist.length} transactions →
                      </button>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>

        {/* ── ECOSYSTEM ── */}
        <div id="ecosystem" style={{ ...card, padding: '24px 28px' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>ONE Ecosystem</div>
            <div style={{ fontSize: 12, color: '#4a7878' }}>Use ONE across the growing Canton Network ecosystem</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { name: 'Raven Markets', category: 'Options', desc: 'Trade digital options on crypto assets. Pick a direction, fixed payout at expiry — no liquidations, no margin.', emoji: '🦅', live: true, url: 'https://app.raven.market' },
              { name: 'FractIt', category: 'Real Estate', desc: 'On-chain real estate index markets. Trade tokenized property baskets 24/7 with atomic settlement on Canton.', emoji: '⬡', live: true, url: 'https://markets.fractit.com' },
              { name: 'Alpend Market', category: 'Money Market', desc: 'Decentralized lending and borrowing on Canton Network. Confidential by design, MEV-free.', emoji: '▲', live: true, url: 'https://market.alpend.com' },
            ].map(app => (
              <div key={app.name} style={{ background: '#071e1e', border: `1px solid ${app.live ? '#1e4040' : '#0d2424'}`, borderRadius: 12, padding: '18px', transition: 'border-color 0.18s', cursor: app.live ? 'pointer' : 'default' }}
                onClick={() => { if (app.url) window.open(app.url, '_blank') }}
                onMouseEnter={e => { if (app.live) e.currentTarget.style.borderColor = `${C.teal}55` }}
                onMouseLeave={e => { if (app.live) e.currentTarget.style.borderColor = '#1e4040' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: '#071818', border: '1px solid #1e4040', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: app.emoji === '+' ? 18 : 20, color: app.emoji === '+' ? '#2a5050' : undefined }}>
                    {app.emoji}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: app.live ? C.teal : '#2a5050', background: app.live ? `${C.teal}12` : '#071818', border: `1px solid ${app.live ? C.teal + '30' : '#0d2424'}`, borderRadius: 100, padding: '3px 8px' }}>
                    {app.category}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: app.live ? '#fff' : '#2a5050', marginBottom: 6 }}>{app.name}</div>
                <div style={{ fontSize: 11, color: '#4a7878', lineHeight: 1.6, marginBottom: app.live ? 12 : 0 }}>{app.desc}</div>
                {app.live && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.teal }}>Use ONE →</div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── WALLET ACTIVITY PAGE ─────────────────────────────────────────────────────

function WalletActivityPage() {
  const navigate = useNavigate()
  const [histFilter, setHistFilter] = useState('All')
  const [search, setSearch] = useState('')

  const histFilters = ['All', 'Swap', 'Stake', 'App']
  const filtered = WALLET_HISTORY.filter(tx => {
    const matchFilter =
      histFilter === 'All'   ? true :
      histFilter === 'Swap'  ? tx.icon === 'swap' :
      histFilter === 'Stake' ? (tx.icon === 'stake' || tx.icon === 'unstake') :
      histFilter === 'App'   ? (tx.icon === 'app' || tx.icon === 'vault' || tx.icon === 'supply' || tx.icon === 'withdraw' || tx.icon === 'borrow' || tx.icon === 'repay') : true
    const matchSearch = !search || tx.type.toLowerCase().includes(search.toLowerCase()) || tx.detail.toLowerCase().includes(search.toLowerCase()) || tx.amount.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const appMeta = {
    raven: { emoji: '🦅', bg: 'rgba(16,185,129,0.12)', color: C.green },
    fract: { emoji: '⬡',  bg: 'rgba(99,102,241,0.12)', color: '#818cf8' },
  }

  const card = { background: '#071818', border: '1px solid #1e4040', borderRadius: 14 }

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      padding: '28px 28px 60px',
      maxWidth: 980, margin: '0 auto',
    }}>
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => navigate('/explore')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, color: '#4a7878', fontSize: 12, fontWeight: 500, cursor: 'pointer', letterSpacing: '-0.01em', marginBottom: 14 }}
          onMouseEnter={e => e.currentTarget.style.color = '#7ababa'}
          onMouseLeave={e => e.currentTarget.style.color = '#4a7878'}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13L5 8l5-5"/>
          </svg>
          Wallet
        </button>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>Activity</div>
        <div style={{ fontSize: 13, color: '#4a7878', marginTop: 4 }}>{WALLET_HISTORY.length} transactions</div>
      </div>

      <div style={{ ...card, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {histFilters.map(f => (
              <button key={f} onClick={() => setHistFilter(f)} style={{
                padding: '5px 12px', borderRadius: 100, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer', transition: 'all 0.15s',
                border: `1px solid ${histFilter === f ? C.teal + '55' : '#1e4040'}`,
                background: histFilter === f ? `${C.teal}15` : 'transparent',
                color: histFilter === f ? C.teal : '#4a7878',
              }}>{f}</button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <input
              type="text" placeholder="Search transactions…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', background: '#071e1e', border: '1px solid #0d2424', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<IcoSwapH />}
            title={WALLET_HISTORY.length === 0 ? 'No transactions yet' : 'No matching transactions'}
            hint={WALLET_HISTORY.length === 0 ? 'Your transaction history will appear here once you start using ONE.' : 'Try clearing the search or switching filters.'}
          />
        ) : (
          filtered.map((tx, i) => {
            const isApp = tx.icon === 'app' && tx.app
            const meta  = isApp ? appMeta[tx.app] : null
            return (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < filtered.length - 1 ? '1px solid #0d2424' : 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: isApp ? 10 : '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isApp ? meta.bg : ({ receive: `${C.green}18`, swap: `${C.teal}15`, send: '#1e4040' })[tx.icon] || '#1e4040',
                  color: isApp ? meta.color : ({ receive: C.green, swap: C.teal, send: '#4a7878' })[tx.icon] || '#4a7878',
                  fontSize: isApp ? 18 : undefined,
                }}>
                  {isApp ? meta.emoji : tx.icon === 'receive' ? <IcoReceive /> : tx.icon === 'swap' ? <IcoSwapH /> : <IcoSend />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {tx.type}
                    {tx.hash && (
                      <a href={`${EXPLORER_BASE}/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#2a4848', textDecoration: 'none', lineHeight: 1, transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = C.teal}
                        onMouseLeave={e => e.currentTarget.style.color = '#2a4848'}>
                        <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#4a7878' }}>{tx.detail}</div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: tx.amount.startsWith('+') ? C.teal : '#fff', marginBottom: 3 }}>{tx.amount}</div>
                  <div style={{ fontSize: 11, color: '#3a6060' }}>{tx.date}</div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────

const SITEMAP = [
  { path: '/explore',         label: 'Wallet / Connect',    desc: 'Connect Loop wallet, whitelist check, ONE balance, swap, send/receive' },
  { path: '/wallet/activity', label: 'Activity',            desc: 'Transaction history for the connected wallet' },
  { path: '/vault',           label: 'Dashboard',           desc: 'Protocol overview, vault summary, collateral health' },
  { path: '/open',            label: 'Open Vault',          desc: 'Two-step modal: pick collateral → set deposit and mint amounts' },
  { path: '/vault/deposit',   label: 'Vault → Deposit',     desc: 'Add CC collateral to existing vault' },
  { path: '/vault/withdraw',  label: 'Vault → Withdraw',    desc: 'Remove CC collateral (within LTV limit)' },
  { path: '/vault/mint',      label: 'Vault → Mint ONE',    desc: 'Draw additional ONE against existing collateral' },
  { path: '/vault/repay',     label: 'Vault → Repay ONE',   desc: 'Pay down debt and optionally withdraw collateral' },
  { path: '/vault/close',     label: 'Vault → Close',       desc: 'Repay full debt, reclaim all collateral, close vault' },
  { path: '/earn',            label: 'Earn',                desc: 'Stability Pool: deposit ONE, earn liquidation rewards' },
  { path: '/token',           label: 'ONE Token',           desc: 'Token stats: peg, supply, protocol parameters' },
]

function SitemapPage() {
  const navigate = useNavigate()
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 40px' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>ONE by Alpend</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: 0 }}>Page Index</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {SITEMAP.map(({ path, label, desc }) => (
          <div
            key={path}
            onClick={() => navigate(path)}
            className="card-hover"
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: 10, border: '1px solid #1a3535', background: '#071818', cursor: 'pointer' }}
          >
            <code style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: C.teal, background: '#0d2828', padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0 }}>{path}</code>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>{label}</div>
              <div style={{ fontSize: 11.5, color: '#4a7878', marginTop: 2 }}>{desc}</div>
            </div>
            <svg style={{ marginLeft: 'auto', flexShrink: 0, color: '#2a5050' }} width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 9.5L9.5 2.5M9.5 2.5H4M9.5 2.5V8"/></svg>
          </div>
        ))}
      </div>
    </div>
  )
}

function AppShell() {
  const loc = useLocation()
  const isWallet = loc.pathname === '/explore' || loc.pathname === '/wallet/activity' || loc.pathname === '/earn'
  const [connected,  setConnected]  = useState(false)
  const [vault,      setVault]      = useState(INITIAL_VAULT)
  const [walletCC,   setWalletCC]   = useState(100000)
  const [walletONE,  setWalletONE]  = useState(3250)
  const [walletYONE, setWalletYONE] = useState(0)

  const connect    = () => setConnected(true)
  const disconnect = () => setConnected(false)

  const handleWalletSwap = (delta) => setWalletONE(prev => Math.max(0, prev + delta))

  const handleStake = (oneAmt) => {
    const yoneOut = oneAmt / YONE_RATE
    setWalletONE(prev  => Math.max(0, prev - oneAmt))
    setWalletYONE(prev => prev + yoneOut)
  }

  const handleUnstake = (yoneAmt) => {
    const oneOut = yoneAmt * YONE_RATE
    setWalletYONE(prev => Math.max(0, prev - yoneAmt))
    setWalletONE(prev  => prev + oneOut)
  }

  const handleVaultOpened = ({ ccAmount, borrowAmount, oneDebt }) => {
    setConnected(true)
    setVault({ id: 1, ccAmount, oneDebt })
    setWalletCC(prev  => prev - ccAmount)
    setWalletONE(prev => prev + borrowAmount)
  }

  const handleVaultUpdate = (newVault, walletDelta = {}) => {
    setVault(newVault)
    if (walletDelta.cc  !== undefined) setWalletCC(prev  => prev + walletDelta.cc)
    if (walletDelta.one !== undefined) setWalletONE(prev => prev + walletDelta.one)
  }

  const handleVaultClose = () => {
    if (!vault) return
    setWalletCC(prev  => prev + vault.ccAmount)
    setWalletONE(prev => Math.max(0, prev - (vault.oneDebt - LIQ_RESERVE)))
    setVault(null)
  }

  const hideNav = isWallet && !connected

  return (
    <div className="app-bg" style={{ minHeight: '100vh', paddingTop: hideNav ? 0 : 56, display: 'flex', flexDirection: 'column' }}>
      {!hideNav && <Nav connected={connected} onConnect={connect} onLogout={disconnect} />}
      {!isWallet && <StatsTicker />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Routes>
          <Route path="/"       element={<SitemapPage />} />
          <Route path="/vault"  element={
            <Dashboard
              connected={connected} onConnect={connect}
              vault={connected ? vault : null}
              onVaultClose={handleVaultClose}
              walletONE={walletONE}
            />}
          />
          <Route path="/open"           element={<OpenVaultPage     onOpen={handleVaultOpened} walletCC={walletCC} />} />
          <Route path="/vault/deposit"  element={<VaultDepositPage  vault={vault} walletCC={walletCC} walletONE={walletONE} onVaultUpdate={handleVaultUpdate} />} />
          <Route path="/vault/withdraw" element={<VaultWithdrawPage vault={vault} walletCC={walletCC} walletONE={walletONE} onVaultUpdate={handleVaultUpdate} />} />
          <Route path="/vault/mint"     element={<VaultMintPage     vault={vault} walletCC={walletCC} walletONE={walletONE} onVaultUpdate={handleVaultUpdate} />} />
          <Route path="/vault/repay"    element={<VaultRepayPage    vault={vault} walletCC={walletCC} walletONE={walletONE} onVaultUpdate={handleVaultUpdate} />} />
          <Route path="/vault/close"    element={<VaultClosePage    vault={vault} walletONE={walletONE} onVaultClose={handleVaultClose} />} />
          <Route path="/earn"           element={<EarnPage connected={connected} onConnect={connect} walletONE={walletONE} walletYONE={walletYONE} onStake={handleStake} onUnstake={handleUnstake} />} />
          <Route path="/token"          element={<TokenPage />} />
          <Route path="/explore"        element={<ExplorePage walletONE={walletONE} walletYONE={walletYONE} walletConnected={connected} onWalletConnect={connect} onDisconnect={disconnect} onWalletSwap={handleWalletSwap} />} />
          <Route path="/wallet/activity" element={<WalletActivityPage />} />
        </Routes>
      </div>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
