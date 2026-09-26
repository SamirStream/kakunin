// Kakunin Telegram bot, local runner (long polling). Needs TELEGRAM_BOT_TOKEN in ../../.env.
//   pnpm bot        (do NOT run it while the cloud webhook is set: Telegram allows one or the other; see `pnpm webhook:delete`)
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore } from '@kakunin/core/store'
import { botConfigFromEnv, createBot } from './bot'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../../../.env'), quiet: true })

const store = createStore(resolve(here, '../../../data/store.json'))
const { bot, deps } = createBot(botConfigFromEnv(store))
// Polling and webhook are mutually exclusive: never silently take over a live cloud webhook.
const hook = await bot.api.getWebhookInfo()
if (hook.url) throw new Error(`A webhook is set (${hook.url}), so the cloud deployment owns this bot. Run \`pnpm webhook:delete\` first to use local polling.`)
bot.start({ onStart: (me) => console.log(`Kakunin bot @${me.username} running (polling) for ${deps.org}`) })
