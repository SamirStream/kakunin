import { ImageResponse } from 'next/og'
import { BRAND, loadJpFont } from '@/lib/ogFont'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

// Browser tab icon: the hanko seal (vermilion tile with the kanji 確).
export default async function Icon() {
  const font = await loadJpFont('確')
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: BRAND.vermilion, borderRadius: 14, color: BRAND.paper, fontSize: 46, fontWeight: 700, fontFamily: 'Noto Serif JP',
        }}
      >
        {font ? '確' : '✓'}
      </div>
    ),
    { ...size, ...(font ? { fonts: [{ name: 'Noto Serif JP', data: font, weight: 700 as const, style: 'normal' as const }] } : {}) },
  )
}
