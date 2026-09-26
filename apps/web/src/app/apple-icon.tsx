import { ImageResponse } from 'next/og'
import { BRAND, loadJpFont } from '@/lib/ogFont'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// iOS home-screen icon: the hanko with its inner frame.
export default async function AppleIcon() {
  const font = await loadJpFont('確')
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.vermilion }}>
        <div
          style={{
            width: 148, height: 148, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 26,
            border: `4px solid ${BRAND.paper}`, color: BRAND.paper, fontSize: 112, fontWeight: 700, fontFamily: 'Noto Serif JP',
          }}
        >
          {font ? '確' : '✓'}
        </div>
      </div>
    ),
    { ...size, ...(font ? { fonts: [{ name: 'Noto Serif JP', data: font, weight: 700 as const, style: 'normal' as const }] } : {}) },
  )
}
