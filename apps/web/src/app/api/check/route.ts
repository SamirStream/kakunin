import type { CheckResult } from '@kakunin/core'
import { limited } from '@/lib/guard'
import { checkFor, getOrg, json } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { org?, telegramId?, username?, displayName? } -> CheckResult. Non-verified results raise an alert for the org.
export async function POST(req: Request) {
  const blocked = limited(req, 'check', 30)
  if (blocked) return blocked
  const body = (await req.json().catch(() => ({}))) as { org?: string; telegramId?: string; username?: string; displayName?: string }
  const ctx = await getOrg(body.org)
  if (!ctx) return json({ status: 'unknown', org: (body.org ?? '').trim().toLowerCase(), reason: 'org-not-registered' }, 200)
  const input = { telegramId: body.telegramId?.trim() || undefined, username: body.username?.trim() || undefined, displayName: body.displayName?.trim() || undefined }
  const result: CheckResult = await checkFor(ctx, input)
  if (result.status !== 'verified' && !(result.status === 'unknown' && result.reason === 'no-identifier'))
    await ctx.scope.addAlert({ kind: result.status, subject: input, detail: input.username ? `@${input.username.replace(/^@/, '')}` : (input.displayName ?? input.telegramId ?? 'unknown') })
  return json(result)
}
