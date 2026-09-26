// x402 seller side for the paid Kakunin check, hosted inside the web app (so it works on Vercel, no extra process).
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { DEPLOYMENT } from '@kakunin/core'
import { checkFor, getOrg } from './server'

/** Base Sepolia: the network the public x402 test facilitator supports. */
export const NETWORK = 'eip155:84532' as const
export const PRICE = '$0.001'
// Ronin bridge exploiter: flagged by the live Intercepta API (sanction_address, known_scammer, blacklist). Used ONLY as the
// scam clone's payTo. (0x8589…FDA16 screened CLEAN, so it is not used.)
export const CLONE_PAY_TO = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96' as const
export const REAL_PAY_TO = (process.env.X402_PAY_TO || DEPLOYMENT.orgWallet) as `0x${string}`

export const x402Server = new x402ResourceServer(new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator' })).register(
  'eip155:*',
  new ExactEvmScheme(),
)

export const routeConfig = (path: string, payTo: `0x${string}`, label: string) => ({
  [path]: {
    accepts: [{ scheme: 'exact' as const, price: PRICE, network: NETWORK, payTo }],
    description: `${label}: is this person a member of ${DEPLOYMENT.orgName}?`,
    mimeType: 'application/json',
  },
})

/** The paid resource itself: run a Kakunin check for the query (telegramId / username / displayName, and optionally `org`). */
export async function paidCheck(req: Request, servedBy: string) {
  const q = new URL(req.url).searchParams
  const input = { telegramId: q.get('telegramId') ?? undefined, username: q.get('username') ?? undefined, displayName: q.get('displayName') ?? undefined }
  const ctx = await getOrg(q.get('org'))
  if (!ctx) return { served_by: servedBy, result: { status: 'unknown' as const, org: q.get('org') ?? '', reason: 'org-not-registered' } }
  return { served_by: servedBy, result: await checkFor(ctx, input) }
}
