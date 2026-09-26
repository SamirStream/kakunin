// Kakunin Telegram bot (grammY). Needs TELEGRAM_BOT_TOKEN in ../../.env. Run: pnpm --filter @kakunin/bot dev
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Bot } from 'grammy'
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { DEPLOYMENT, chainReader, issueTelegramAttestation, publicClient } from '@kakunin/core'
import { JsonStore } from '@kakunin/core/store'
import { WELCOME, extractSubject, handleCheck, handleStart, type Deps } from './handlers'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token || token === 'placeholder') throw new Error('Set TELEGRAM_BOT_TOKEN in .env (create a bot with @BotFather)')
const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const pub = publicClient(rpc)
const ctxFor = (envKey: string) => {
  const account = privateKeyToAccount(process.env[envKey] as Hex)
  return { pub, account, wallet: createWalletClient({ account, chain: sepolia, transport: http(rpc) }) }
}
const orgCtx = ctxFor('ORG_PRIVATE_KEY')
const hrCtx = ctxFor('HR_PRIVATE_KEY')
const store = new JsonStore(fileURLToPath(new URL('../../../data/store.json', import.meta.url)))
const ADMIN_SECRET = process.env.ADMIN_SECRET

const bot = new Bot(token)
const deps: Deps = {
  store,
  reader: chainReader(pub),
  org: DEPLOYMENT.orgName,
  issue: (label, telegramId) => issueTelegramAttestation({ org: orgCtx, hr: hrCtx, label, telegramId }),
  async notifyAdmins(text) {
    for (const chat of store.read().orgAdminChats) await bot.api.sendMessage(chat, text)
  },
}
const awaitingHandle = new Set<number>()

// Every interaction refreshes the stored @username / display name of a known numeric ID (usernames are mutable).
bot.use(async (ctx, next) => {
  const f = ctx.from
  if (f) store.refreshIdentity(String(f.id), f.username, [f.first_name, f.last_name].filter(Boolean).join(' ') || undefined)
  await next()
})

bot.command('start', async (ctx) => {
  await ctx.reply(await handleStart(deps, ctx.from!, ctx.match.trim()))
})
bot.command('help', (ctx) => ctx.reply(WELCOME))
bot.command('check', async (ctx) => {
  const arg = ctx.match.trim()
  if (!arg) {
    awaitingHandle.add(ctx.chat.id)
    return ctx.reply(`Which person? Forward one of their messages, or send their @username / numeric ID. (Org: ${deps.org})`)
  }
  const subject = extractSubject({ text: arg.split(/\s+/).at(-1) })
  if (!subject) return ctx.reply('Send a @username, a numeric ID, or forward a message.')
  await ctx.reply((await handleCheck(deps, subject)).text)
})
// Admin: /subscribe <ADMIN_SECRET> in the org's chat to receive impersonation alerts.
bot.command('subscribe', async (ctx) => {
  if (!ADMIN_SECRET || ctx.match.trim() !== ADMIN_SECRET) return ctx.reply('❌ Wrong secret.')
  store.addOrgAdminChat(ctx.chat.id)
  await ctx.reply(`🔔 This chat will receive impersonation alerts for ${deps.org}.`)
})
// Forwarded messages (or a bare @username after /check).
bot.on('message', async (ctx) => {
  const subject = extractSubject(ctx.message as any)
  const waiting = awaitingHandle.delete(ctx.chat.id)
  if (!subject) return waiting ? ctx.reply('I could not read that. Send a @username or forward a message.') : ctx.reply(WELCOME)
  await ctx.reply((await handleCheck(deps, subject)).text)
})

bot.catch((e) => console.error('bot error:', e.message))
bot.start({ onStart: (me) => console.log(`Kakunin bot @${me.username} running for ${deps.org}`) })
