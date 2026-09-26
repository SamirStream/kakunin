'use client'
import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

// QR code of the one-time Telegram link, drawn as inline SVG (no image, no network). Lets HR onboard a member from a phone screen.
export function InviteQR({ url, size = 176 }: { url: string; size?: number }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const count = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { path: d, n: count }
  }, [url])
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label="QR code of the Telegram invite link" shapeRendering="crispEdges" className="rounded-lg">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={path} fill="#15171c" />
    </svg>
  )
}
