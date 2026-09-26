// The verdict hanko. The kanji says what the answer is; the ink colour only reinforces it (and a text label always sits next to it).
//   確 verified · 元 former (moto) · 偽 lookalike (nise, "fake") · 未 unknown (mi, "not yet")
export type Verdict = 'verified' | 'former' | 'lookalike' | 'unknown'

export const GLYPH: Record<Verdict, string> = { verified: '確', former: '元', lookalike: '偽', unknown: '未' }
const INK: Record<Verdict, string> = { verified: 'var(--stamp-ok)', former: 'var(--stamp-warn)', lookalike: 'var(--stamp-bad)', unknown: 'var(--stamp-mute)' }
const NAME: Record<Verdict, string> = { verified: 'Verified', former: 'Former member', lookalike: 'Lookalike', unknown: 'Unknown' }

/** One shared SVG filter that roughens the edges like real ink on paper. Render once per page (the layout does). */
export function StampDefs() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
      <filter id="kk-ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

export function Stamp({ status, size = 96, animate = false, className = '' }: { status: Verdict; size?: number; animate?: boolean; className?: string }) {
  return (
    <span className={`stamp-wrap ${animate ? 'is-anim' : ''} ${className}`} style={{ color: INK[status], width: size, height: size }}>
      <svg className={`stamp ${animate ? 'stamp-anim' : ''}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`${NAME[status]} stamp`}>
        <g transform="rotate(-6 60 60)">
          <rect x="7" y="7" width="106" height="106" rx="17" fill="none" stroke="currentColor" strokeWidth="5.5" />
          <rect x="17" y="17" width="86" height="86" rx="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <text x="60" y="87" textAnchor="middle" className="font-jp" fontWeight="700" fontSize="62" fill="currentColor">{GLYPH[status]}</text>
        </g>
      </svg>
    </span>
  )
}
