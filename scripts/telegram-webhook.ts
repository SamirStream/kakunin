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

if (cmd === 'menu') {
  // Bot profile for the Mini App: the menu button (bottom-left of the chat) opens it, plus commands and a clear description.
  const url = `${base.replace(/\/$/, '')}/tg`
  const steps: [string, object][] = [
    ['setChatMenuButton', { menu_button: { type: 'web_app', text: 'Kakunin', web_app: { url } } }],
    ['setMyCommands', { commands: [
      { command: 'app', description: 'Open Kakunin: your card, checks, team' },
      { command: 'check', description: 'Check a @username or Telegram ID' },
      { command: 'pick', description: 'Pick a contact from your chats and check them' },
      { command: 'help', description: 'What Kakunin does' },
    ] }],
    ['setMyShortDescription', { short_description: 'Is this recruiter really from that project? Verify people against their ENS team registry.' }],
    ['setMyDescription', { description: 'Kakunin (確認) tells you whether someone really belongs to a Web3 project. Forward a suspicious message, pick a contact, or open the app. Answers come from ENSv2 team registries, with proof.' }],
  ]
  for (const [method, body] of steps) console.log(method.padEnd(24), (await api(method, body)).ok ? 'ok' : 'FAILED')
  console.log(`Mini App url: ${url}`)
} else if (cmd === 'set') {
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
