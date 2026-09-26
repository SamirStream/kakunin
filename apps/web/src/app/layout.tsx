import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kakunin 確認 — is this recruiter really from that project?',
  description: 'Verify that a person really belongs to a Web3 project, using an ENSv2 team registry and signed attestations.',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

const NAV = [
  { href: '/check', label: 'Check' },
  { href: '/org/kakunin-demo.eth', label: 'Org dashboard' },
  { href: '/demo', label: 'Demo' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2 font-bold">
              <span className="text-lg">Kakunin</span>
              <span style={{ color: 'var(--muted)' }} className="text-sm">確認</span>
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 font-medium hover:bg-[var(--info-bg)]">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs" style={{ color: 'var(--muted)' }}>
          Testnet only (Sepolia). Built for ETHGlobal Tokyo 2026 on ENSv2.
        </footer>
      </body>
    </html>
  )
}
