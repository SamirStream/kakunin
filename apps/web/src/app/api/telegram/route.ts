import { webhookCallback } from 'grammy'
import { botConfigFromEnv, createBot } from '@kakunin/bot/bot'
import { json, store } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // onboarding writes two records on-chain (about 25 s on Sepolia)

// Telegram webhook: the cloud replacement for the long-polling bot. Telegram sends the secret configured with setWebhook in
// the X-Telegram-Bot-Api-Secret-Token header; anything else is rejected. Register it with `pnpm webhook:set`.
let handler: ((req: Request) => Promise<Response>) | undefined

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) return json({ error: 'TELEGRAM_WEBHOOK_SECRET is not configured' }, 503)
  if (!handler) {
    try {
      const { bot } = createBot(botConfigFromEnv(store))
      handler = webhookCallback(bot, 'std/http', { secretToken: secret, timeoutMilliseconds: 55_000 }) as (req: Request) => Promise<Response>
    } catch (e) {
      return json({ error: (e as Error).message }, 503)
    }
  }
  return handler(req)
}
