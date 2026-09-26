import { issueTelegramAttestation } from '@kakunin/core'
import { displayName, isResponse, tgAuth } from '@/lib/tg'
import { dropTeamCaches, getOrg, json, store } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // two Sepolia transactions

// POST { token }: the authenticated Telegram account claims a one-time invite. The ID that gets attested is the one Telegram
// signed in initData, never a value the page sends, so nobody can attest someone else's account.
//   member invite -> the account is bound to its team subname and attested on ENS
//   admin invite  -> the account becomes an administrator of the organisation (alerts + Mini App team console)
export async function POST(req: Request) {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const { token } = (await req.json().catch(() => ({}))) as { token?: string }
  const inv = token && /^[A-Za-z0-9_-]{8,40}$/.test(token) ? await store.peekInvite(token) : null
  const ctx = inv ? await getOrg(inv.org) : null
  if (!inv || !ctx) return json({ error: 'invalid_invite', message: 'This invite link is invalid or was already used.' }, 404)
  try {
    if (inv.kind === 'admin') {
      await store.consumeInvite(token!)
      await ctx.scope.addOrgAdminChat(a.user.id)
      return json({ ok: true, admin: true, org: ctx.name })
    }
    const { attester, hr } = ctx.signers()
    const { fqn } = await issueTelegramAttestation({ org: attester as never, hr, label: inv.label, telegramId: String(a.user.id) }, ctx.d)
    await store.consumeInvite(token!)
    await ctx.scope.upsertMember({ label: inv.label, telegramId: String(a.user.id), username: a.user.username?.toLowerCase(), displayName: displayName(a.user) })
    dropTeamCaches(ctx.name)
    return json({ ok: true, fqn, label: inv.label, org: ctx.name })
  } catch (e) {
    return json({ error: 'onboard_failed', message: (e as Error).message.slice(0, 200) }, 500) // the invite stays usable
  }
}
