import { DEPLOYMENT, listMembers, memberName, readText } from '@kakunin/core'
import { cached, getDirectory, json, pub } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Members with status, role and history — everything derived from ENSv2 state + registry events.
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.has('fresh')
  const data = await cached('members', fresh ? 0 : 3000, async () => {
    const dir = getDirectory()
    const members = await listMembers(pub)
    return Promise.all(
      members.map(async (m) => {
        const fqn = memberName(m.label)
        const active = m.status === 'active'
        const [role, since] = active ? await Promise.all([readText(pub, fqn, 'org.role'), readText(pub, fqn, 'org.since')]) : [null, null]
        const d = dir.find((e) => e.label === m.label)
        return { ...m, fqn, role, since, telegramId: d?.telegramId ?? null, username: d?.username ?? null }
      }),
    )
  })
  return json({ org: DEPLOYMENT.orgName, team: DEPLOYMENT.teamName, members: data })
}
