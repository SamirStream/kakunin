import { getAddress, isAddress } from 'viem'
import { MAX_ORGS, startProvision, progressOf, type ProvisionEnv } from '@kakunin/core/provision'
import { limited } from '@/lib/guard'
import { envSigner, json, keySecret, pub, store } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET: the organisations that publish a team on Kakunin (public on-chain facts only; never keys).
export async function GET() {
  const orgs = (await store.listOrgs()).sort((a, b) => b.createdAt - a.createdAt).map((o) => ({
    name: o.name, team: o.deployment.teamName, owner: o.owner, teamRegistry: o.deployment.teamRegistry, createdAt: o.createdAt,
  }))
  return json({ orgs, capacity: MAX_ORGS })
}

// POST { label, owner }: start creating an organisation (returns a job the browser then advances). Sponsored testnet ETH is
// scarce, so creation is rate limited per client and capped overall; the name is checked against ENSv2 before anything is spent.
export async function POST(req: Request) {
  const blocked = limited(req, 'org-create', 3, 3600_000)
  if (blocked) return blocked
  if (keySecret().length < 16) return json({ error: 'not_configured', message: 'Organisation creation is not enabled on this deployment.' }, 503)
  const { label, owner } = (await req.json().catch(() => ({}))) as { label?: string; owner?: string }
  if (!label || !owner || !isAddress(owner)) return json({ error: 'invalid_input', message: 'Give a name and the wallet address that will own it.' }, 400)
  try {
    const env: ProvisionEnv = { pub, sponsor: envSigner('ORG_PRIVATE_KEY').account, secret: keySecret(), rpc: process.env.SEPOLIA_RPC_URL }
    const job = await startProvision(store, env, { label, owner: getAddress(owner) })
    return json(progressOf(job), 201)
  } catch (e) {
    return json({ error: 'cannot_create', message: (e as Error).message }, 409)
  }
}
