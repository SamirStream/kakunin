import type { Metadata } from 'next'
import Script from 'next/script'
import { TgApp } from '@/components/tg/TgApp'

export const metadata: Metadata = {
  title: 'Kakunin for Telegram',
  description: 'The Kakunin Telegram Mini App: verify who you are talking to, carry your verified card, and run your team from your phone.',
  robots: { index: false },
}

// Telegram's official Mini App SDK. It exposes window.Telegram.WebApp with the signed initData the server validates.
export default function TelegramMiniApp() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <TgApp />
    </>
  )
}
