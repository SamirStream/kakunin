// Request guards for API routes (server-only).
import { createRateLimiter } from '@kakunin/core'
import { agentAllowed, demoSignerAllowed } from '@kakunin/core/access'
import { json } from './server'

/** Best-effort client key: the first hop of x-forwarded-for when behind a proxy, otherwise a single "local" bucket. */
export const clientKey = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'

const limiters = new Map<string, ReturnType<typeof createRateLimiter>>()
/** Returns a 429 Response when `req` is over its limit for this bucket, else null. */
export function limited(req: Request, bucket: string, max: number, windowMs = 60_000, keyOf: (r: Request) => string = clientKey): Response | null {
  let rl = limiters.get(bucket)
  if (!rl) limiters.set(bucket, (rl = createRateLimiter(max, windowMs)))
  return rl.take(keyOf(req)) ? null : json({ error: 'too many requests, slow down' }, 429)
}

function accessInput(req: Request) {
  return {
    enabled: process.env.KAKUNIN_DEMO_SIGNER === '1',
    local: ['localhost', '127.0.0.1'].includes(new URL(req.url).hostname),
    proxied: req.headers.has('x-forwarded-for') || req.headers.has('x-forwarded-host') || req.headers.has('forwarded'),
    expectedToken: process.env.DEMO_ADMIN_TOKEN,
    providedToken: req.headers.get('x-demo-token'),
  }
}

const DENIED = () => json({ error: 'demo signer disabled: enter the demo admin token (or run locally)' }, 403)

/**
 * State-changing demo actions (/api/demo: HR revoke / reset) sign with the throwaway server-side keys. Off unless
 * KAKUNIN_DEMO_SIGNER=1, and then only for plain localhost requests or callers that send the DEMO_ADMIN_TOKEN.
 */
export function demoSignerBlocked(req: Request): Response | null {
  return demoSignerAllowed(accessInput(req)) ? null : DENIED()
}

/**
 * /api/agent spends 0.001 testnet USDC and two Intercepta calls per run. Same rules as above, or open to everyone when
 * KAKUNIN_AGENT_PUBLIC=1, in which case it is rate limited (3 runs / 10 min per client, 150 / day overall).
 */
export function agentBlocked(req: Request): Response | null {
  const input = accessInput(req)
  const pub = process.env.KAKUNIN_AGENT_PUBLIC === '1'
  if (!agentAllowed({ ...input, publicFlag: pub })) return DENIED()
  if (pub && !demoSignerAllowed(input)) {
    return limited(req, 'agent-client', 3, 10 * 60_000) ?? limited(req, 'agent-global', 150, 24 * 3600_000, () => 'all')
  }
  return null
}
