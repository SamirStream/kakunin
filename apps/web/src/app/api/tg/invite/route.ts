import { memberName } from '@kakunin/core'
import { isResponse, tgAuth } from '@/lib/tg'
import { getOrg, json, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { token }: what is this one-time invite for? (Shown before the person confirms.) Does NOT consume it.
// kind 'member': join a team as <label>; kind 'admin': become an administrator of the organisation (alerts + team console).
export async function POST(req: Request) {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const { token } = (await req.json().catch(() => ({}))) as { token?: string }
  const inv = token && /^[A-Za-z0-9_-]{8,40}$/.test(token) ? await store.peekInvite(token) : null
  const ctx = inv ? await getOrg(inv.org) : null
  if (!inv || !ctx) return json({ error: 'invalid_invite', message: 'This invite link is invalid or was already used. Ask your admin for a new one.' }, 404)
  return json({ kind: inv.kind ?? 'member', label: inv.label, fqn: memberName(inv.label, ctx.d), org: ctx.name })
}
