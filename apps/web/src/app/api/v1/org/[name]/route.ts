import { apiJson, preflight } from '@/lib/api'
import { limited } from '@/lib/guard'
import { getOrg, getTeam } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Public API v1: the team an org publishes on ENSv2 (names, roles, status). No Telegram IDs or usernames.
export const OPTIONS = () => preflight()

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const blocked = limited(req, 'v1-org', 60)
  if (blocked) return apiJson({ ok: false, error: 'rate_limited' }, 429, { 'retry-after': '60' })
  const { name } = await ctx.params
  const org = decodeURIComponent(name).toLowerCase()
  const oc = await getOrg(org)
  if (!oc) return apiJson({ ok: false, error: 'org_not_registered', message: `${org} does not publish a team on Kakunin.` }, 404)
  const members = await getTeam(oc)
  return apiJson({
    ok: true, api: 'v1', org, team: oc.d.teamName, chain: 'sepolia',
    contracts: { teamRegistry: oc.d.teamRegistry, teamResolver: oc.d.teamResolver, orgRegistry: oc.d.orgRegistry },
    counts: { active: members.filter((m) => m.status === 'active').length, former: members.filter((m) => m.status === 'former').length },
    members,
  })
}
