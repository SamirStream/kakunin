import { listMembers, memberName, readText } from '@kakunin/core'
import { hasAdminSession } from '@/lib/orgauth'
import { cached, getDirectory, isResponse, json, orgOr404, pub } from '@/lib/server'

export const dynamic = 'force-dynamic'

// GET ?org=: members with status, role and history — everything derived from ENSv2 state + registry events.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const ctx = await orgOr404(q.get('org'))
  if (isResponse(ctx)) return ctx
  const data = await cached(`members:${ctx.name}`, q.has('fresh') ? 0 : 3000, async () => {
    const dir = await getDirectory(ctx)
    const members = await listMembers(pub, ctx.d)
    return Promise.all(
      members.map(async (m) => {
        const fqn = memberName(m.label, ctx.d)
        const active = m.status === 'active'
        const [role, since] = active ? await Promise.all([readText(pub, fqn, 'org.role', ctx.d), readText(pub, fqn, 'org.since', ctx.d)]) : [null, null]
        const d = dir.find((e) => e.label === m.label)
        return { ...m, fqn, role, since, telegramId: d?.telegramId ?? null, username: d?.username ?? null }
      }),
    )
  })
  // @usernames live in Kakunin's off-chain directory: only signed-in admins see them (Telegram IDs are already public on-chain).
  const seeUsernames = await hasAdminSession(req, ctx)
  return json({
    org: ctx.name, team: ctx.d.teamName, owner: ctx.d.orgWallet, operator: ctx.record?.operator ?? null, demo: ctx.demo,
    teamRegistry: ctx.d.teamRegistry, createdAt: ctx.record?.createdAt ?? null,
    members: seeUsernames ? data : data.map((m) => ({ ...m, username: null })),
  })
}
