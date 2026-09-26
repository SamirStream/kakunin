import { checkIdentity } from '@kakunin/core'
import { apiJson, preflight } from '@/lib/api'
import { limited } from '@/lib/guard'
import { getDirectory, org, reader, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Public API v1: is this person a member of <org>? GET ?telegramId=…&username=…&displayName=…&org=… (or POST the same JSON).
// Answers verified | former | lookalike | unknown, with a `proof` object for verified members. CORS enabled, rate limited.
async function handle(input: { org?: string | null; telegramId?: string | null; username?: string | null; displayName?: string | null }, req: Request) {
  const blocked = limited(req, 'v1-check', 60)
  if (blocked) return apiJson({ ok: false, error: 'rate_limited', message: 'Too many requests, max 60 per minute.' }, 429, { 'retry-after': '60' })
  const claimed = (input.org ?? org).trim().toLowerCase()
  if (claimed !== org) return apiJson({ ok: true, api: 'v1', result: { status: 'unknown', org: claimed, reason: 'org-not-registered' } })
  const clean = { telegramId: input.telegramId?.trim() || undefined, username: input.username?.trim().replace(/^@/, '') || undefined, displayName: input.displayName?.trim() || undefined }
  if (!clean.telegramId && !clean.username && !clean.displayName)
    return apiJson({ ok: false, error: 'missing_identifier', message: 'Provide telegramId, username or displayName.' }, 400)
  if ([clean.telegramId, clean.username, clean.displayName].some((v) => (v?.length ?? 0) > 100)) return apiJson({ ok: false, error: 'too_long' }, 400)
  const result = await checkIdentity(reader, clean, await getDirectory())
  if (result.status !== 'verified')
    await store.addAlert({ org, kind: result.status, subject: clean, detail: clean.username ? `@${clean.username}` : (clean.displayName ?? clean.telegramId ?? 'unknown') })
  return apiJson({ ok: true, api: 'v1', checkedAt: new Date().toISOString(), result })
}

export const OPTIONS = () => preflight()

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  return handle({ org: q.get('org'), telegramId: q.get('telegramId'), username: q.get('username'), displayName: q.get('displayName') }, req)
}

export async function POST(req: Request) {
  return handle(await req.json().catch(() => ({})), req)
}
