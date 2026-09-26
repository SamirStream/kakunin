// Dev tool: prints a correctly SIGNED Mini App initData for a chosen Telegram user, so the Mini App API can be tested locally
// or in CI without opening Telegram. It uses the bot token from .env, so treat the output as sensitive for a few minutes.
//   pnpm --filter @kakunin/scripts exec tsx tg-initdata.ts <userId> [username]
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { signInitData } from '@kakunin/core/telegram'

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
const token = process.env.TELEGRAM_BOT_TOKEN
if (!token || token === 'placeholder') throw new Error('TELEGRAM_BOT_TOKEN missing in .env')
const [id, username] = process.argv.slice(2)
if (!id || !/^\d+$/.test(id)) throw new Error('usage: tg-initdata <numeric user id> [username]')
process.stdout.write(signInitData({ query_id: 'dev', user: JSON.stringify({ id: Number(id), first_name: 'Dev', username }), auth_date: String(Math.floor(Date.now() / 1000)) }, token))
