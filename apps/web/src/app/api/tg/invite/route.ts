import { memberName } from '@kakunin/core'
import { isResponse, tgAuth } from '@/lib/tg'
import { json, org, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { token }: which member is this one-time invite for? (Shown before the person confirms.) Does NOT consume it.
export async function POST(req: Request) {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const { token } = (await req.json().catch(() => ({}))) as { token?: string }
  const inv = token && /^[A-Za-z0-9_-]{8,40}$/.test(token) ? await store.peekInvite(token) : null
  if (!inv) return json({ error: 'invalid_invite', message: 'This invite link is invalid or was already used. Ask your HR for a new one.' }, 404)
  return json({ label: inv.label, fqn: memberName(inv.label), org })
}
