import { ImageResponse } from 'next/og'
import { BRAND, loadJpFont } from '@/lib/ogFont'

export const alt = 'Kakunin 確認: is this recruiter really from that project?'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const CHIPS = [
  ['Verified member', '#0f7a4a', '#e3f1e8'],
  ['Former member', '#8f5200', '#fbeed2'],
  ['Lookalike', '#b3261e', '#fbe6e2'],
  ['Unknown', '#3b4a63', '#ebe7dc'],
] as const

// Social preview card (links shared on X / Telegram / Discord): the hanko, the promise and the four answers.
export default async function OG() {
  const font = await loadJpFont('確認')
  const jp = font ? 'Noto Serif JP' : undefined
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: BRAND.paper, color: BRAND.ink }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ width: 84, height: 84, borderRadius: 16, background: BRAND.vermilion, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${BRAND.vermilion}`, transform: 'rotate(-4deg)' }}>
            <div style={{ width: 68, height: 68, borderRadius: 10, border: `2px solid ${BRAND.paper}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: BRAND.paper, fontSize: 52, fontWeight: 700, fontFamily: jp }}>
              {font ? '確' : '✓'}
            </div>
          </div>
          <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -1 }}>Kakunin</div>
          {font && <div style={{ fontSize: 34, color: '#5e5a52', fontFamily: jp, fontWeight: 700 }}>確認</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.04, maxWidth: 1000, letterSpacing: -2 }}>Is this recruiter really from that project?</div>
          <div style={{ fontSize: 30, color: '#5e5a52', maxWidth: 950 }}>Projects publish their team on ENSv2. Anyone, and any AI agent, can verify a person in one second.</div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {CHIPS.map(([t, fg, bg]) => (
            <div key={t} style={{ padding: '10px 22px', borderRadius: 999, fontSize: 25, fontWeight: 700, color: fg, background: bg }}>{t}</div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 28, color: '#5e5a52', fontWeight: 700 }}>kakunin.xyz</div>
        </div>
      </div>
    ),
    { ...size, ...(font ? { fonts: [{ name: 'Noto Serif JP', data: font, weight: 700 as const, style: 'normal' as const }] } : {}) },
  )
}
