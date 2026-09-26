import { isResponse, requireAdmin } from '@/lib/orgauth'
import { json, orgOr404 } from '@/lib/server'

export const dynamic = 'force-dynamic'

// GET ?org=: the impersonation alerts of one organisation. Public for the reference (sandbox) org so /demo can show them live;
// for every other organisation they are private to its admin wallet (session signature in x-kk-issued / x-kk-sig).
export async function GET(req: Request) {
  const ctx = await orgOr404(new URL(req.url).searchParams.get('org'))
  if (isResponse(ctx)) return ctx
  if (!ctx.demo) {
    const auth = await requireAdmin(req, ctx, 'session')
    if (isResponse(auth)) return auth
  }
  const [alerts, admins] = await Promise.all([ctx.scope.alerts(50), ctx.scope.adminChats()])
  return json({ alerts, telegramAdmins: admins.length })
}
