import { checkIdentity, type CheckResult } from '@kakunin/core'
import { getDirectory, json, org, reader, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { org?, telegramId?, username?, displayName? } -> CheckResult. Non-verified results raise an alert for the org.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { org?: string; telegramId?: string; username?: string; displayName?: string }
  const claimed = (body.org ?? org).trim().toLowerCase()
  if (claimed !== org)
    return json({ status: 'unknown', org: claimed, reason: 'org-not-registered' }, 200)
  const input = { telegramId: body.telegramId?.trim() || undefined, username: body.username?.trim() || undefined, displayName: body.displayName?.trim() || undefined }
  const result: CheckResult = await checkIdentity(reader, input, getDirectory())
  if (result.status !== 'verified' && !(result.status === 'unknown' && result.reason === 'no-identifier'))
    store.addAlert({ org, kind: result.status, subject: input, detail: input.username ? `@${input.username.replace(/^@/, '')}` : (input.displayName ?? input.telegramId ?? 'unknown') })
  return json(result)
}
