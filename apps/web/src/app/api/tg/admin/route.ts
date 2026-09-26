import { getTeam, json, org, getDirectory, store } from '@/lib/server'
import { isResponse, tgAdmin } from '@/lib/tg'

export const dynamic = 'force-dynamic'

// POST: the team console data (org admins only): members with attested Telegram IDs, plus the latest impersonation alerts.
export async function POST(req: Request) {
  const a = await tgAdmin(req)
  if (isResponse(a)) return a
  const [team, dir, alerts] = await Promise.all([getTeam(), getDirectory(), store.alerts(12)])
  const members = team.map((m) => {
    const d = dir.find((e) => e.label === m.label)
    return { ...m, telegramId: d?.telegramId ?? null, username: d?.username ?? null }
  })
  return json({
    org,
    members,
    alerts,
    stats: {
      active: members.filter((m) => m.status === 'active').length,
      revoked: members.filter((m) => m.status === 'former').length,
      attested: members.filter((m) => m.status === 'active' && m.telegramId).length,
      alerts24h: alerts.filter((x) => Date.now() - x.at < 24 * 3600_000).length,
    },
  })
}
