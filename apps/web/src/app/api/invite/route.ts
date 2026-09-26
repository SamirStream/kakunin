import { DEPLOYMENT, getMemberState } from '@kakunin/core'
import { verifyInviteAuth } from '@kakunin/core/auth'
import { limited } from '@/lib/guard'
import { botUsername, json, pub, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { label, issuedAt, signature } -> one-time Telegram deep link.
// An invite lets its holder bind THEIR Telegram ID to the member subname, so it is only issued against a fresh EIP-191
// signature from the org's HR or ORG wallet (dashboard signs it with the connected wallet). Member must already be registered.
export async function POST(req: Request) {
  const blocked = limited(req, 'invite', 10)
  if (blocked) return blocked
  const { label, issuedAt, signature } = (await req.json().catch(() => ({}))) as { label?: string; issuedAt?: number; signature?: `0x${string}` }
  if (!label || !/^[a-z0-9-]{1,32}$/.test(label)) return json({ error: 'invalid label' }, 400)
  if (typeof issuedAt !== 'number' || typeof signature !== 'string') return json({ error: 'signature required: connect the HR or ORG wallet' }, 401)
  const auth = await verifyInviteAuth({ org: DEPLOYMENT.orgName, label, issuedAtMs: issuedAt, signature, allowedSigners: [DEPLOYMENT.hrWallet, DEPLOYMENT.orgWallet] })
  if (!auth.ok) return json({ error: auth.reason }, 401)
  if ((await getMemberState(pub, label)).status !== 'REGISTERED') return json({ error: label + ' is not an active member' }, 409)
  const inv = await store.createInvite(label)
  return json({ token: inv.token, url: 'https://t.me/' + botUsername() + '?start=' + inv.token })
}
