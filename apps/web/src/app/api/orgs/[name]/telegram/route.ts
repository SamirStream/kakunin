import { limited } from '@/lib/guard'
import { isResponse, requireAdmin } from '@/lib/orgauth'
import { botUsername, json, orgOr404 } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST (signed by an org admin): a one-time link that makes whoever opens it in Telegram an admin of this organisation, so they get
// impersonation alerts in the chat and the team console in the Mini App.
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const blocked = limited(req, 'org-telegram', 10)
  if (blocked) return blocked
  const ctx = await orgOr404(decodeURIComponent((await params).name))
  if (isResponse(ctx)) return ctx
  const auth = await requireAdmin(req, ctx, 'telegram-admin')
  if (isResponse(auth)) return auth
  const inv = await ctx.scope.createInvite('-', 'admin')
  return json({ url: `https://t.me/${botUsername()}?start=${inv.token}`, admins: (await ctx.scope.adminChats()).length })
}
