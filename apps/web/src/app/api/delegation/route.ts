import { ABIS, ROLE } from '@kakunin/core'
import { isResponse, json, orgOr404, pub } from '@/lib/server'

export const dynamic = 'force-dynamic'

// GET ?org=: what the delegated account (HR wallet / Kakunin operator) can and cannot do, read live from the EAC role bitmaps.
// This is the ENSv2 delegation story: the org root stays with the owner.
export async function GET(req: Request) {
  const ctx = await orgOr404(new URL(req.url).searchParams.get('org'))
  if (isResponse(ctx)) return ctx
  const d = ctx.d
  const has = (address: `0x${string}`, abi: any, roles: bigint, who: `0x${string}`) =>
    pub.readContract({ address, abi, functionName: 'hasRootRoles', args: [roles, who] }) as Promise<boolean>
  const [regTeam, unregTeam, renewTeam, resolverTeam, regOrg, unregOrg, setResolverOrg, textTeamResolver, textOrgResolver, ownerRoot] = await Promise.all([
    has(d.teamRegistry, ABIS.registry, ROLE.REGISTRAR, d.hrWallet),
    has(d.teamRegistry, ABIS.registry, ROLE.UNREGISTER, d.hrWallet),
    has(d.teamRegistry, ABIS.registry, ROLE.RENEW, d.hrWallet),
    has(d.teamRegistry, ABIS.registry, ROLE.SET_RESOLVER, d.hrWallet),
    has(d.orgRegistry, ABIS.registry, ROLE.REGISTRAR, d.hrWallet),
    has(d.orgRegistry, ABIS.registry, ROLE.UNREGISTER, d.hrWallet),
    has(d.orgRegistry, ABIS.registry, ROLE.SET_RESOLVER, d.hrWallet),
    has(d.teamResolver, ABIS.resolver, ROLE.RESOLVER_SET_TEXT, d.hrWallet),
    has(d.orgResolver, ABIS.resolver, ROLE.RESOLVER_SET_TEXT, d.hrWallet),
    has(d.orgRegistry, ABIS.registry, ROLE.SET_RESOLVER, d.orgWallet),
  ])
  return json({
    hr: d.hrWallet, org: d.orgWallet, selfServe: !!ctx.record, ownerControlsRoot: ownerRoot,
    teamRegistry: { address: d.teamRegistry, name: d.teamName, register: regTeam, unregister: unregTeam, renew: renewTeam, setResolver: resolverTeam },
    orgRegistry: { address: d.orgRegistry, name: d.orgName, register: regOrg, unregister: unregOrg, setResolver: setResolverOrg },
    teamResolver: { address: d.teamResolver, setText: textTeamResolver },
    orgResolver: { address: d.orgResolver, setText: textOrgResolver },
  })
}
