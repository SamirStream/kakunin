// Kakunin hanko: the red seal (concept A of the brand canvas). A hanko is the stamp Japan uses to approve a document, which is
// exactly what a verified answer is. The kanji 確 ("certain, confirmed") is set in Noto Serif JP (loaded by the layout).
export function HankoMark({ size = 32, title = 'Kakunin' }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" role="img" aria-label={title}>
      <g transform="rotate(-4 120 120)">
        <rect x="12" y="12" width="216" height="216" rx="36" fill="var(--brand)" />
        <rect x="28" y="28" width="184" height="184" rx="24" fill="none" stroke="#f4efe3" strokeWidth="4" />
        <text x="120" y="172" textAnchor="middle" className="font-jp" fontWeight="700" fontSize="150" fill="#f4efe3">確</text>
      </g>
    </svg>
  )
}

/** Back-compat alias used across the app. */
export const LogoMark = HankoMark
