import { DEPLOYMENT } from '@kakunin/core'
import { apiJson, preflight } from '@/lib/api'
import { limited } from '@/lib/guard'
import { getTeam } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Public API v1: the team an org publishes on ENSv2 (names, roles, status). No Telegram IDs or usernames.
export const OPTIONS = () => preflight()

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const blocked = limited(req, 'v1-org', 60)
  if (blocked) return apiJson({ ok: false, error: 'rate_limited' }, 429, { 'retry-after': '60' })
  const { name } = await ctx.params
  const org = decodeURIComponent(name).toLowerCase()
  if (org !== DEPLOYMENT.orgName) return apiJson({ ok: false, error: 'org_not_registered', message: `${org} does not publish a team on Kakunin.` }, 404)
  const members = await getTeam()
  return apiJson({
    ok: true, api: 'v1', org, team: DEPLOYMENT.teamName, chain: 'sepolia',
    contracts: { teamRegistry: DEPLOYMENT.teamRegistry, teamResolver: DEPLOYMENT.teamResolver, orgRegistry: DEPLOYMENT.orgRegistry },
    counts: { active: members.filter((m) => m.status === 'active').length, former: members.filter((m) => m.status === 'former').length },
    members,
  })
}
