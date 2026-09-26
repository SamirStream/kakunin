import { limited } from '@/lib/guard'
import { isResponse, requireAdmin } from '@/lib/orgauth'
import { json, orgOr404 } from '@/lib/server'

export const dynamic = 'force-dynamic'

// GET (admin session): the organisation's report queue, newest first.
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await orgOr404(decodeURIComponent((await params).name))
  if (isResponse(ctx)) return ctx
  const auth = await requireAdmin(req, ctx, 'session')
  if (isResponse(auth)) return auth
  return json({ reports: await ctx.scope.reports() })
}

// POST { id, decision: 'confirm' | 'dismiss' } signed by an admin (action confirm-report / dismiss-report, target = the report id).
// Confirming makes every check of that account answer "reported impersonator of <org>", with the admin decision date.
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const blocked = limited(req, 'org-reports', 30)
  if (blocked) return blocked
  const ctx = await orgOr404(decodeURIComponent((await params).name))
  if (isResponse(ctx)) return ctx
  const { id, decision } = (await req.json().catch(() => ({}))) as { id?: string; decision?: string }
  if (!id || !/^[a-f0-9]{12}$/.test(id) || (decision !== 'confirm' && decision !== 'dismiss')) return json({ error: 'invalid_input' }, 400)
  const auth = await requireAdmin(req, ctx, decision === 'confirm' ? 'confirm-report' : 'dismiss-report', id)
  if (isResponse(auth)) return auth
  const r = await ctx.scope.decideReport(id, decision === 'confirm' ? 'confirmed' : 'dismissed')
  return r ? json({ ok: true, report: r }) : json({ error: 'not_found' }, 404)
}
