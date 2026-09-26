import { issueTelegramAttestation } from '@kakunin/core'
import { displayName, dropTeamCaches, isResponse, signer, tgAuth } from '@/lib/tg'
import { json, store } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // two Sepolia transactions

// POST { token }: the authenticated Telegram account claims a one-time invite. The ID that gets attested is the one Telegram
// signed in initData, never a value the page sends, so nobody can attest someone else's account.
export async function POST(req: Request) {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const { token } = (await req.json().catch(() => ({}))) as { token?: string }
  const inv = token && /^[A-Za-z0-9_-]{8,40}$/.test(token) ? await store.peekInvite(token) : null
  if (!inv) return json({ error: 'invalid_invite', message: 'This invite link is invalid or was already used.' }, 404)
  try {
    const { fqn } = await issueTelegramAttestation({ org: signer('ORG_PRIVATE_KEY'), hr: signer('HR_PRIVATE_KEY'), label: inv.label, telegramId: String(a.user.id) })
    await store.consumeInvite(token!)
    await store.upsertMember({ label: inv.label, telegramId: String(a.user.id), username: a.user.username?.toLowerCase(), displayName: displayName(a.user) })
    dropTeamCaches()
    return json({ ok: true, fqn, label: inv.label })
  } catch (e) {
    return json({ error: 'onboard_failed', message: (e as Error).message.slice(0, 200) }, 500) // the invite stays usable
  }
}
