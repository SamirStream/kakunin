import { revokeMember } from '@kakunin/core'
import { LABEL_RE, isResponse, tgAdmin } from '@/lib/tg'
import { dropTeamCaches, json } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { label, org? }: an org admin revokes a member from their phone. Signed on the server by the organisation's HR key, which on
// ENSv2 holds the UNREGISTER role on the team registry only: the same limited power the dashboard shows, never the org root name.
export async function POST(req: Request) {
  const body = (await req.clone().json().catch(() => ({}))) as { label?: string; org?: string }
  const a = await tgAdmin(req, body.org)
  if (isResponse(a)) return a
  if (!body.label || !LABEL_RE.test(body.label)) return json({ error: 'invalid_label' }, 400)
  try {
    const r = await revokeMember(a.ctx.signers().hr, body.label, a.ctx.d)
    dropTeamCaches(a.ctx.name)
    return json({ ok: true, label: body.label, alreadyRevoked: r.skipped })
  } catch (e) {
    return json({ error: 'revoke_failed', message: (e as Error).message.slice(0, 200) }, 500)
  }
}
