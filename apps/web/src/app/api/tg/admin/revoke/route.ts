import { revokeMember } from '@kakunin/core'
import { LABEL_RE, dropTeamCaches, isResponse, signer, tgAdmin } from '@/lib/tg'
import { json } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { label }: an org admin revokes a member from their phone. Signed on the server by the HR wallet, which on ENSv2 holds the
// UNREGISTER role on the team registry only: the same limited power the dashboard shows, never the org root name.
export async function POST(req: Request) {
  const a = await tgAdmin(req)
  if (isResponse(a)) return a
  const { label } = (await req.json().catch(() => ({}))) as { label?: string }
  if (!label || !LABEL_RE.test(label)) return json({ error: 'invalid_label' }, 400)
  try {
    const r = await revokeMember(signer('HR_PRIVATE_KEY'), label)
    dropTeamCaches()
    return json({ ok: true, label, alreadyRevoked: r.skipped })
  } catch (e) {
    return json({ error: 'revoke_failed', message: (e as Error).message.slice(0, 200) }, 500)
  }
}
