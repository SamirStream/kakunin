import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist, Geist_Mono, Noto_Serif_JP } from 'next/font/google'
import Link from 'next/link'
import { LogoMark } from '@/components/Logo'
import { StampDefs } from '@/components/Stamp'
import { ThemeToggle } from '@/components/ThemeToggle'
import './globals.css'

// Type: Bricolage Grotesque for voice (headlines), Geist for reading and interface, Geist Mono for IDs and addresses,
// Noto Serif JP only for the seals and kanji.
const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-display', display: 'swap' })
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })
const jp = Noto_Serif_JP({ subsets: ['latin'], weight: ['700'], variable: '--font-jp', display: 'swap', preload: false })

const SITE = 'https://kakunin.xyz'
const TITLE = 'Kakunin 確認: is this recruiter really from that project?'
const DESC = 'Verify that a person really belongs to a Web3 project. ENSv2 team registries, signed attestations, a Telegram bot and an x402 API for AI agents.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: '%s · Kakunin' },
  description: DESC,
  applicationName: 'Kakunin',
  openGraph: { type: 'website', url: SITE, siteName: 'Kakunin', title: TITLE, description: DESC },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#efe9dc' }, { media: '(prefers-color-scheme: dark)', color: '#131519' }] }

const NAV = [
  { href: '/check', label: 'Check' },
  { href: '/org/kakunin-demo.eth', label: 'Dashboard' },
  { href: '/demo', label: 'Demo' },
  { href: '/docs', label: 'API' },
]

// Applies the saved theme before first paint (no flash). Static string, no user input.
// ?theme=light|dark overrides the saved choice for that visit (handy for sharing a specific look).
const THEME_BOOT = `try{var t=localStorage.getItem('kk-theme');var q=new URLSearchParams(location.search).get('theme');if(q==='light'||q==='dark')t=q;if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} ${jp.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <StampDefs />
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--panel)] focus:px-3 focus:py-2">Skip to content</a>
        <header className="sticky top-0 z-40 backdrop-blur" style={{ background: 'color-mix(in srgb, var(--bg) 78%, transparent)', borderBottom: '1px solid var(--line)' }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Kakunin home">
              <LogoMark size={32} />
              <span className="display text-[1.35rem] font-extrabold tracking-tight">Kakunin</span>
              <span className="font-jp text-sm" style={{ color: 'var(--muted)' }} aria-hidden>確認</span>
            </Link>
            <nav aria-label="Main" className="flex flex-wrap items-center gap-0.5 text-[.92rem]">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-1.5 font-medium transition-colors hover:bg-[var(--info-bg)]">{n.label}</Link>
              ))}
              <a href="https://t.me/KakuninxyzBot/app" target="_blank" rel="noopener noreferrer" className="btn btn-primary ml-2 !px-4 !py-2 !text-[.88rem]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M21.5 3.2 2.8 10.4c-1.3.5-1.3 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.3 4.8 3.5c.9.5 1.5.2 1.7-.8L22.9 4.9c.3-1.3-.5-1.9-1.4-1.7ZM8.6 13.2l9.7-6.1c.5-.3.9-.1.5.2l-8.1 7.3-.3 3.5-1.8-4.9Z" /></svg>
                Open in Telegram
              </a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children}</main>
        <footer style={{ borderTop: '1px solid var(--line)' }}>
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 text-sm sm:grid-cols-[1fr_auto]" style={{ color: 'var(--muted)' }}>
            <div className="space-y-1">
              <p className="display text-base font-bold" style={{ color: 'var(--ink)' }}>Kakunin <span className="font-jp font-normal" style={{ color: 'var(--muted)' }}>確認</span></p>
              <p>By Samir Touinssi, CEO of <a className="font-semibold underline" style={{ color: 'var(--ink)' }} href="https://thearch.consulting" target="_blank" rel="noopener noreferrer">The Arch</a>. Built at ETHGlobal Tokyo 2026 on testnet (Sepolia).</p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap items-start gap-x-5 gap-y-1">
              <a className="underline" href="https://t.me/KakuninxyzBot/app" target="_blank" rel="noopener noreferrer">Telegram Mini App</a>
              <Link className="underline" href="/docs">API</Link>
              <a className="underline" href="https://github.com/SamirStream/kakunin" target="_blank" rel="noopener noreferrer">Source</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  )
}
