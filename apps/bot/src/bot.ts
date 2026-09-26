// Kakunin Telegram bot factory (grammY). Used by two runners:
//   - src/index.ts          : long polling, for local development (`pnpm bot`)
//   - apps/web /api/telegram : webhook, for the cloud deployment (serverless, no long-running process)
// Everything here is stateless between updates except an in-memory rate limiter; persistent state lives in the Store.
import { Bot, InlineKeyboard, Keyboard } from 'grammy'
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { DEPLOYMENT, chainReader, createRateLimiter, issueTelegramAttestation, publicClient } from '@kakunin/core'
import type { Store } from '@kakunin/core/store'
import { WELCOME, extractSubject, handleCheck, handleStart, type Deps } from './handlers'

export interface BotConfig {
  token: string
  store: Store
  orgKey: Hex
  hrKey: Hex
  adminSecret?: string
  rpc?: string
}

/** Read the bot configuration from the environment, failing with a clear message when something is missing. */
export function botConfigFromEnv(store: Store, env: Record<string, string | undefined> = process.env): BotConfig {
  const need = (k: string) => {
    const v = env[k]
    if (!v || v === 'placeholder') throw new Error(`${k} is not set`)
    return v
  }
  return {
    token: need('TELEGRAM_BOT_TOKEN'),
    store,
    orgKey: need('ORG_PRIVATE_KEY') as Hex,
    hrKey: need('HR_PRIVATE_KEY') as Hex,
    adminSecret: env.ADMIN_SECRET && env.ADMIN_SECRET !== 'change-me' ? env.ADMIN_SECRET : undefined,
    rpc: env.SEPOLIA_RPC_URL,
  }
}

export function createBot(cfg: BotConfig): { bot: Bot; deps: Deps } {
  const rpc = cfg.rpc ?? 'https://ethereum-sepolia-rpc.publicnode.com'
  const pub = publicClient(rpc)
  const ctxFor = (key: Hex) => {
    const account = privateKeyToAccount(key)
    return { pub, account, wallet: createWalletClient({ account, chain: sepolia, transport: http(rpc) }) }
  }
  const orgCtx = ctxFor(cfg.orgKey)
  const hrCtx = ctxFor(cfg.hrKey)
  const { store } = cfg

  const bot = new Bot(cfg.token)
  const deps: Deps = {
    store,
    reader: chainReader(pub),
    org: DEPLOYMENT.orgName,
    issue: (label, telegramId) => issueTelegramAttestation({ org: orgCtx, hr: hrCtx, label, telegramId }),
    async notifyAdmins(text) {
      for (const chat of await store.adminChats()) await bot.api.sendMessage(chat, text)
    },
  }
  const awaitingHandle = new Set<number>() // only changes the wording of one error message, so losing it between serverless calls is harmless

  // Every failed check alerts the org and costs RPC calls: cap each conversation at 12 messages/minute.
  const limiter = createRateLimiter(12, 60_000)
  bot.use(async (ctx, next) => {
    if (ctx.chat && !limiter.take(String(ctx.chat.id))) {
      await ctx.reply('Too many requests, please slow down and try again in a minute.').catch(() => {})
      return
    }
    await next()
  })

  // Every interaction refreshes the stored @username / display name of a known numeric ID (usernames are mutable).
  bot.use(async (ctx, next) => {
    const f = ctx.from
    if (f) await store.refreshIdentity(String(f.id), f.username, [f.first_name, f.last_name].filter(Boolean).join(' ') || undefined)
    await next()
  })

  // The Mini App (same engine, richer screens). Buttons open it inside Telegram, with the user's signed identity.
  const appUrl = `${(process.env.PUBLIC_URL || 'https://kakunin.xyz').replace(/\/$/, '')}/tg`
  const openApp = new InlineKeyboard().webApp('Open Kakunin', appUrl)
  // Telegram's own contact picker: the bot receives the chosen account's real numeric ID, even if that person hides forwards.
  const pick = new Keyboard().requestUsers('Pick a person to check', 1, { user_is_bot: false, request_username: true, request_name: true }).oneTime().resized()

  bot.command('start', async (ctx) => {
    const payload = ctx.match.trim()
    if (payload === 'pick') return ctx.reply('Tap the button, choose the person from your chats, and I will check them.', { reply_markup: pick })
    await ctx.reply(await handleStart(deps, ctx.from!, payload), { reply_markup: openApp })
  })
  bot.command('app', (ctx) => ctx.reply('Your verified card, quick checks and the team console, in one place:', { reply_markup: openApp }))
  bot.command('pick', (ctx) => ctx.reply('Tap the button, choose the person from your chats, and I will check them.', { reply_markup: pick }))
  bot.on('message:users_shared', async (ctx) => {
    for (const u of ctx.message.users_shared.users) {
      const subject = { telegramId: String(u.user_id), username: u.username, displayName: [u.first_name, u.last_name].filter(Boolean).join(' ') || undefined }
      await ctx.reply((await handleCheck(deps, subject)).text, { reply_markup: { remove_keyboard: true } })
    }
  })
  bot.command('help', (ctx) => ctx.reply(WELCOME, { reply_markup: openApp }))
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
    if (!cfg.adminSecret || ctx.match.trim() !== cfg.adminSecret) return ctx.reply('❌ Wrong secret.')
    await store.addOrgAdminChat(ctx.chat.id)
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
  return { bot, deps }
}
