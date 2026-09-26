import { addMember, revokeMember, setMemberText } from '@kakunin/core'
import { limited } from '@/lib/guard'
import { isResponse, requireAdmin } from '@/lib/orgauth'
import { LABEL_RE, botUsername, dropTeamCaches, json, orgOr404, orgSigners } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // up to three Sepolia transactions

// POST { action: 'add' | 'revoke', label, role?, since? } with the admin's wallet signature in x-kk-issued / x-kk-sig.
// The server then acts with the organisation's operator key (the reference org: its HR key), so admins never need gas.
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const blocked = limited(req, 'org-members', 20)
  if (blocked) return blocked
  const ctx = await orgOr404(decodeURIComponent((await params).name))
  if (isResponse(ctx)) return ctx
  const { action, label, role, since } = (await req.json().catch(() => ({}))) as { action?: string; label?: string; role?: string; since?: string }
  if (!label || !LABEL_RE.test(label)) return json({ error: 'invalid_label', message: 'Use a-z, 0-9 and dashes (max 32).' }, 400)
  if (action !== 'add' && action !== 'revoke') return json({ error: 'unknown_action' }, 400)
  if (role && role.length > 60) return json({ error: 'role_too_long' }, 400)
  const auth = await requireAdmin(req, ctx, action === 'add' ? 'add-member' : 'revoke-member', label)
  if (isResponse(auth)) return auth
  try {
    const { hr } = orgSigners(ctx)
    if (action === 'revoke') {
      const r = await revokeMember(hr, label, ctx.d)
      dropTeamCaches(ctx.name)
      return json({ ok: true, label, alreadyRevoked: r.skipped })
    }
    await addMember(hr, label, ctx.d)
    await setMemberText(hr, label, 'org.role', role || 'Member', ctx.d)
    await setMemberText(hr, label, 'org.since', /^\d{4}-\d{2}-\d{2}$/.test(since ?? '') ? since! : new Date().toISOString().slice(0, 10), ctx.d)
    const inv = await ctx.scope.createInvite(label)
    dropTeamCaches(ctx.name)
    return json({ ok: true, label, token: inv.token, url: `https://t.me/${botUsername()}?start=${inv.token}` })
  } catch (e) {
    return json({ error: 'failed', message: (e as Error).message.split('\n')[0].slice(0, 200) }, 500)
  }
}
