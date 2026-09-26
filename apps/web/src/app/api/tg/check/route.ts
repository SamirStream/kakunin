import { relatesToOrg, type CheckResult } from '@kakunin/core'
import { isResponse, tgAuth } from '@/lib/tg'
import { checkFor, json, orgs } from '@/lib/server'

export const dynamic = 'force-dynamic'

const RANK: Record<CheckResult['status'], number> = { verified: 0, former: 1, lookalike: 2, unknown: 3 }

// POST { who, org? } from inside Telegram: @username or numeric ID. With `org` the answer is about that organisation; without it
// Kakunin looks the person up in every organisation and returns the most relevant answer (verified > former > lookalike > unknown).
// An organisation is alerted when the person is an ex-member or imitates a member; when the caller named the org, any non-verified answer alerts it.
export async function POST(req: Request) {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const { who, org } = (await req.json().catch(() => ({}))) as { who?: string; org?: string }
  const w = (who ?? '').trim().replace(/^@/, '')
  if (!w || w.length > 100) return json({ error: 'invalid_input' }, 400)
  const input = /^\d{5,}$/.test(w) ? { telegramId: w } : { username: w }
  const named = (org ?? '').trim().toLowerCase()
  const names = named ? [named] : await orgs.names()
  const results: CheckResult[] = []
  for (const name of names.slice(0, 20)) {
    const ctx = await orgs.get(name)
    if (!ctx) { if (named) return json({ status: 'unknown', org: named, reason: 'org-not-registered' }); continue }
    const result = await checkFor(ctx, input).catch(() => null)
    if (!result) continue
    results.push(result)
    if (result.status !== 'verified' && (named || relatesToOrg(result.status)))
      await ctx.scope.addAlert({ kind: result.status, subject: input, detail: `${'username' in input ? '@' : ''}${w} (checked by Telegram user ${a.user.id})` })
  }
  results.sort((x, y) => RANK[x.status] - RANK[y.status])
  return json(results[0] ?? { status: 'unknown', org: names[0] ?? '' })
}
