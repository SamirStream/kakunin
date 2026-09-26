import { limited } from '@/lib/guard'
import { checkFor, getOrg, json, notifyAdmins } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { org, kind?, telegramId?, username?, displayName?, note? }: anyone reports an account that impersonates an organisation
// (kind 'impersonation', the default) or an official member account that looks compromised (kind 'compromised').
// A report changes NOTHING public: it lands in the organisation's queue (dashboard + Telegram alert to its admins), and only an
// admin's signed confirmation makes checks say "reported impersonator". Abuse limits: 5 reports per hour and 20 per day per client.
export async function POST(req: Request) {
  const blocked = limited(req, 'report-hour', 5, 3600_000) ?? limited(req, 'report-day', 20, 24 * 3600_000)
  if (blocked) return blocked
  const b = (await req.json().catch(() => ({}))) as { org?: string; kind?: string; telegramId?: string; username?: string; displayName?: string; note?: string }
  const ctx = await getOrg(b.org)
  if (!ctx || !b.org) return json({ error: 'org_not_found', message: 'Name the organisation being impersonated (for example acme.eth).' }, 404)
  const telegramId = b.telegramId?.trim().replace(/\D/g, '') || undefined
  const username = b.username?.trim().replace(/^@/, '') || undefined
  if (!telegramId && !username) return json({ error: 'missing_subject', message: 'Give the @username or numeric Telegram ID of the account.' }, 400)
  if ((telegramId?.length ?? 0) > 20 || (username?.length ?? 0) > 64 || (b.note?.length ?? 0) > 500) return json({ error: 'too_long' }, 400)
  if (username && !/^[A-Za-z0-9_]{3,64}$/.test(username)) return json({ error: 'invalid_username' }, 400)
  const kind = b.kind === 'compromised' ? 'compromised' : 'impersonation'
  const current = await checkFor(ctx, { ...(telegramId ? { telegramId } : {}), ...(username ? { username } : {}) }).catch(() => null)
  // A verified member is not an impersonator (do not let the queue fill with reports about real people), and only a verified
  // member's account can be "compromised".
  if (kind === 'impersonation' && current?.status === 'verified') return json({ error: 'verified_member', message: `That account is a verified member of ${ctx.name}. If it seems taken over, report it as compromised.` }, 409)
  if (kind === 'compromised' && current?.status !== 'verified') return json({ error: 'not_a_member', message: `Only a verified member of ${ctx.name} can be reported as compromised.` }, 409)
  const report = await ctx.scope.addReport({ kind, subject: { telegramId, username, displayName: b.displayName?.trim() }, note: b.note })
  const who = username ? '@' + username : 'ID ' + telegramId
  if (report.count === 1)
    await notifyAdmins(ctx, kind === 'compromised'
      ? `🚨 ${ctx.name}: a verified member's account (${who}) was reported as COMPROMISED. If it is, mark it compromised now: https://kakunin.xyz/org/${ctx.name}`
      : `🚩 ${ctx.name}: an account was reported as impersonating you (${who}). Review it on your dashboard: https://kakunin.xyz/org/${ctx.name}`)
  return json({ ok: true, id: report.id, count: report.count, message: 'Thank you. The organisation was notified; nothing is published until its admins confirm the report.' })
}
