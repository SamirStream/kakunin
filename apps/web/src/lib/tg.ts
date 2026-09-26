// Server helpers for the Telegram Mini App API. Every request carries Telegram's signed `initData` in the x-tg-init header;
// we validate the signature with the bot token on EVERY call (stateless, no session to steal) and only then trust the user ID.
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { validateInitData, type TgUser } from '@kakunin/core/telegram'
import { LABEL_RE, invalidate, json, pub, store } from './server'
import { limited } from './guard'

export { LABEL_RE }

export interface TgAuth { user: TgUser; startParam?: string }

/** Validates the caller. Returns the authenticated Telegram user, or a ready-to-send 401/429/503 Response. */
export async function tgAuth(req: Request): Promise<TgAuth | Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || token === 'placeholder') return json({ error: 'telegram_not_configured' }, 503)
  const r = validateInitData(req.headers.get('x-tg-init'), token, { maxAgeSec: 24 * 3600 })
  if (!r.ok) return json({ error: 'unauthorized', reason: r.reason }, 401)
  // Per-user limit (not per IP: behind Telegram's WebView many users share addresses).
  const blocked = limited(req, 'tg-user', 60, 60_000, () => String(r.user.id))
  if (blocked) return blocked
  return { user: r.user, startParam: r.startParam }
}
export const isResponse = (x: unknown): x is Response => x instanceof Response

/** Org admins are the Telegram accounts that ran /subscribe with the admin secret (their private chat ID equals their user ID). */
export async function isTgAdmin(userId: number): Promise<boolean> {
  return (await store.adminChats()).includes(userId)
}

/** Guard for admin-only routes. */
export async function tgAdmin(req: Request): Promise<TgAuth | Response> {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  return (await isTgAdmin(a.user.id)) ? a : json({ error: 'forbidden', message: 'This account is not an org admin. Send /subscribe <secret> to the bot from it.' }, 403)
}

/** HR / ORG signing contexts from the server env (throwaway testnet keys). HR does the team work, ORG only signs attestations. */
export function signer(envKey: 'HR_PRIVATE_KEY' | 'ORG_PRIVATE_KEY') {
  const pk = process.env[envKey]
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error(`${envKey} is not configured`)
  const account = privateKeyToAccount(pk as Hex)
  const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
  return { pub, account, wallet: createWalletClient({ account, chain: sepolia, transport: http(rpc) }), log: () => {} }
}

/** After any change to the team, drop the cached reads so the next screen shows the truth. */
export const dropTeamCaches = () => { invalidate('team'); invalidate('members'); invalidate('lookup:') }

export const displayName = (u: TgUser) => [u.first_name, u.last_name].filter(Boolean).join(' ') || undefined
