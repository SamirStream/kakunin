import { checkIdentity, type CheckResult } from '@kakunin/core'
import { adminOrgs, displayName, isResponse, tgAuth } from '@/lib/tg'
import { getDirectory, json, orgs, org as DEMO_ORG, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

const RANK: Record<CheckResult['status'], number> = { verified: 0, former: 1, lookalike: 2, unknown: 3 }

// Who is opening the Mini App? The Telegram account is authenticated by initData, so "my card" cannot be requested for someone else.
// A person can belong to several organisations: `memberships` lists each, `result` is the most relevant one (verified first).
export async function POST(req: Request) {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const id = String(a.user.id)
  const [adminOf, memberOf, names] = await Promise.all([adminOrgs(a.user.id), store.memberOrgs(id), orgs.names()])
  const toCheck = (memberOf.length ? memberOf : [DEMO_ORG]).slice(0, 6)
  const memberships = (await Promise.all(toCheck.map(async (name) => {
    const ctx = await orgs.get(name)
    // By numeric ID only: the ID is the identity, the @username is not.
    return ctx ? checkIdentity(ctx.reader, { telegramId: id }, await getDirectory(ctx)).catch(() => null) : null
  }))).filter((r): r is CheckResult => !!r).sort((x, y) => RANK[x.status] - RANK[y.status])
  return json({
    user: { id: a.user.id, name: displayName(a.user) ?? a.user.username ?? 'You', username: a.user.username ?? null, photo: a.user.photo_url ?? null },
    admin: adminOf.length > 0,
    adminOf,
    orgs: names,
    startParam: a.startParam ?? null,
    result: memberships[0] ?? { status: 'unknown', org: DEMO_ORG },
    memberships: memberships.filter((r) => r.status === 'verified' || r.status === 'former'),
  })
}
