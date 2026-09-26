// Telegram Mini App authentication. Telegram signs `initData` (the query string a Mini App receives) with a key derived from the bot
// token, so the server can be SURE which Telegram account opened the app: the numeric ID cannot be forged by the page or the user.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Node-only (node:crypto); exported as `@kakunin/core/telegram`.
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface TgUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

export type InitDataResult =
  | { ok: true; user: TgUser; authDate: number; startParam?: string }
  | { ok: false; reason: 'missing' | 'no-hash' | 'bad-signature' | 'expired' | 'no-user' | 'bad-user' }

const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest()

/** The string Telegram signs: every field except `hash`, sorted by key, as `key=value` lines. */
const dataCheckString = (params: URLSearchParams) =>
  [...params.entries()].filter(([k]) => k !== 'hash').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n')

export function validateInitData(
  initData: string | null | undefined,
  botToken: string,
  opts: { maxAgeSec?: number; nowMs?: number } = {},
): InitDataResult {
  if (!initData) return { ok: false, reason: 'missing' }
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'no-hash' }

  const secret = hmac('WebAppData', botToken)
  const expected = hmac(secret, dataCheckString(params))
  const given = Buffer.from(hash, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad-signature' }

  const authDate = Number(params.get('auth_date'))
  const now = (opts.nowMs ?? Date.now()) / 1000
  // Bound replay: a captured initData is only good for a limited time (and never from the future).
  if (!Number.isFinite(authDate) || now - authDate > (opts.maxAgeSec ?? 3600) || authDate - now > 300) return { ok: false, reason: 'expired' }

  const rawUser = params.get('user')
  if (!rawUser) return { ok: false, reason: 'no-user' }
  try {
    const user = JSON.parse(rawUser) as TgUser
    if (!Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, reason: 'bad-user' }
    return { ok: true, user, authDate, startParam: params.get('start_param') ?? undefined }
  } catch {
    return { ok: false, reason: 'bad-user' }
  }
}

/** Builds a correctly signed initData string. For tests and the local dev tool only: the real one is produced by Telegram. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields)
  const hash = hmac(hmac('WebAppData', botToken), dataCheckString(params)).toString('hex')
  params.set('hash', hash)
  return params.toString()
}
