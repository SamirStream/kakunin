import { getMemberState } from '@kakunin/core'
import { limited } from '@/lib/guard'
import { isResponse, requireAdmin } from '@/lib/orgauth'
import { LABEL_RE, botUsername, json, orgOr404, pub } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { org?, label } signed by an org admin (x-kk-issued / x-kk-sig) -> one-time Telegram deep link.
// An invite lets its holder bind THEIR Telegram ID to the member subname, so it is only issued against a fresh wallet signature
// naming this exact member. The member must already be registered on the team registry.
export async function POST(req: Request) {
  const blocked = limited(req, 'invite', 10)
  if (blocked) return blocked
  const { org, label } = (await req.json().catch(() => ({}))) as { org?: string; label?: string }
  if (!label || !LABEL_RE.test(label)) return json({ error: 'invalid label' }, 400)
  const ctx = await orgOr404(org)
  if (isResponse(ctx)) return ctx
  const auth = await requireAdmin(req, ctx, 'invite', label)
  if (isResponse(auth)) return auth
  if ((await getMemberState(pub, label, ctx.d)).status !== 'REGISTERED') return json({ error: label + ' is not an active member' }, 409)
  const inv = await ctx.scope.createInvite(label)
  return json({ token: inv.token, url: 'https://t.me/' + botUsername() + '?start=' + inv.token })
}
