import type { Metadata, Viewport } from 'next'
import { Noto_Serif_JP, Space_Grotesk } from 'next/font/google'
import Link from 'next/link'
import { LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import './globals.css'

// Brand type (from the logo canvas): Space Grotesk for the interface, Noto Serif JP for the seal and the kanji.
const sans = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-sans', display: 'swap' })
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
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f3efe6' }, { media: '(prefers-color-scheme: dark)', color: '#15171c' }] }

const NAV = [
  { href: '/check', label: 'Check' },
  { href: '/org/kakunin-demo.eth', label: 'Org dashboard' },
  { href: '/demo', label: 'Live demo' },
  { href: '/docs', label: 'API' },
]

// Applies the saved theme before first paint (no flash). Static string, no user input.
const THEME_BOOT = `try{var t=localStorage.getItem('kk-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${jp.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--panel)] focus:px-3 focus:py-2">Skip to content</a>
        <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 82%, transparent)' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <LogoMark size={34} />
              <span className="text-lg font-bold tracking-tight">Kakunin</span>
              <span style={{ color: 'var(--muted)' }} className="font-jp text-sm">確認</span>
            </Link>
            <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 font-medium hover:bg-[var(--info-bg)]">{n.label}</Link>
              ))}
              <a href="https://t.me/KakuninxyzBot/app" target="_blank" rel="noopener noreferrer" className="btn btn-primary !px-3 !py-1.5 !text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M21.5 3.2 2.8 10.4c-1.3.5-1.3 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.3 4.8 3.5c.9.5 1.5.2 1.7-.8L22.9 4.9c.3-1.3-.5-1.9-1.4-1.7ZM8.6 13.2l9.7-6.1c.5-.3.9-.1.5.2l-8.1 7.3-.3 3.5-1.8-4.9Z" /></svg>
                Open in Telegram
              </a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs" style={{ color: 'var(--muted)' }}>
            <p>
              Powered by the CEO of{' '}
              <a className="font-semibold underline" style={{ color: 'var(--ink)' }} href="https://thearch.consulting" target="_blank" rel="noopener noreferrer">thearch.consulting</a>
              {' '}· Samir Touinssi
            </p>
            <p>
              <a className="font-semibold underline" style={{ color: 'var(--ink)' }} href="https://t.me/KakuninxyzBot/app" target="_blank" rel="noopener noreferrer">Open the Telegram Mini App</a>
              {' '}· Testnet only (Sepolia) · ETHGlobal Tokyo 2026 · ENSv2 · x402 · Intercepta ·{' '}
              <a className="underline" href="https://github.com/SamirStream/kakunin" target="_blank" rel="noopener noreferrer">open source</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
