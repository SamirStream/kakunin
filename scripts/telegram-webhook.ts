// Switch the Telegram bot between the cloud (webhook on the Vercel site) and local polling. Never prints the token.
//   pnpm webhook:set [https://your-site]   -> Telegram pushes updates to <site>/api/telegram (stop `pnpm bot` first)
//   pnpm webhook:delete                    -> back to local polling (`pnpm bot`)
//   pnpm webhook:info                      -> current webhook state
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
config({ path: envPath, quiet: true })
const token = process.env.TELEGRAM_BOT_TOKEN
if (!token || token === 'placeholder') throw new Error('TELEGRAM_BOT_TOKEN missing in .env')
const api = (method: string, body?: object) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then((r) => r.json() as Promise<{ ok: boolean; result?: any; description?: string }>)

const [cmd = 'info', base = process.env.PUBLIC_URL ?? 'https://kakunin.xyz'] = process.argv.slice(2)

if (cmd === 'set') {
  // The webhook secret must be the SAME value in .env and in the Vercel environment (TELEGRAM_WEBHOOK_SECRET).
  let secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) {
    secret = randomBytes(24).toString('base64url')
    const cur = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
    writeFileSync(envPath, `${cur.trimEnd()}\n\n# Telegram webhook secret (same value must be set in the Vercel project env)\nTELEGRAM_WEBHOOK_SECRET=${secret}\n`)
    console.log('Generated TELEGRAM_WEBHOOK_SECRET in .env: copy that value to the Vercel environment variables too.')
  }
  const url = `${base.replace(/\/$/, '')}/api/telegram`
  const r = await api('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true })
  console.log(r.ok ? `webhook set -> ${url}` : `FAILED: ${r.description}`)
} else if (cmd === 'delete') {
  const r = await api('deleteWebhook', { drop_pending_updates: true })
  console.log(r.ok ? 'webhook deleted: run `pnpm bot` for local polling' : `FAILED: ${r.description}`)
} else {
  const r = await api('getWebhookInfo')
  const i = r.result ?? {}
  console.log(JSON.stringify({ url: i.url || null, pending_update_count: i.pending_update_count, last_error_date: i.last_error_date ? new Date(i.last_error_date * 1000).toISOString() : null, last_error_message: i.last_error_message ?? null }, null, 2))
}
