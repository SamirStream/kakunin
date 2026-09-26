// Server helpers for the Telegram Mini App API. Every request carries Telegram's signed `initData` in the x-tg-init header;
// we validate the signature with the bot token on EVERY call (stateless, no session to steal) and only then trust the user ID.
import { validateInitData, type TgUser } from '@kakunin/core/telegram'
import { LABEL_RE, isResponse, json, orgOr404, store, type OrgCtx } from './server'
import { limited } from './guard'

export { LABEL_RE, isResponse }

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

/** Organisations this Telegram account administers: it ran /subscribe (reference org) or opened an admin link from the dashboard. */
export const adminOrgs = (userId: number) => store.adminOrgs(userId)
export const isTgAdmin = async (userId: number) => (await adminOrgs(userId)).length > 0

/**
 * Guard for admin-only routes. `orgName` picks the organisation (default: the first one this account administers).
 * Returns the authenticated user and the resolved organisation, or a ready 401/403/404.
 */
export async function tgAdmin(req: Request, orgName?: string | null): Promise<(TgAuth & { ctx: OrgCtx; adminOf: string[] }) | Response> {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const adminOf = await adminOrgs(a.user.id)
  if (!adminOf.length) return json({ error: 'forbidden', message: 'This account is not an org admin. Open the admin link from your organisation dashboard.' }, 403)
  const name = (orgName ?? '').trim().toLowerCase() || adminOf[0]
  if (!adminOf.includes(name)) return json({ error: 'forbidden', message: `This account does not administer ${name}.` }, 403)
  const ctx = await orgOr404(name)
  if (isResponse(ctx)) return ctx
  return { ...a, ctx, adminOf }
}

export const displayName = (u: TgUser) => [u.first_name, u.last_name].filter(Boolean).join(' ') || undefined
