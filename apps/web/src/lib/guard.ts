// Request guards for API routes (server-only).
import { createRateLimiter } from '@kakunin/core'
import { json } from './server'

/** Best-effort client key: the first hop of x-forwarded-for when behind a proxy, otherwise a single "local" bucket. */
export const clientKey = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'

const limiters = new Map<string, ReturnType<typeof createRateLimiter>>()
/** Returns a 429 Response when `req` is over its limit for this bucket, else null. */
export function limited(req: Request, bucket: string, max: number, windowMs = 60_000): Response | null {
  let rl = limiters.get(bucket)
  if (!rl) limiters.set(bucket, (rl = createRateLimiter(max, windowMs)))
  return rl.take(clientKey(req)) ? null : json({ error: 'too many requests, slow down' }, 429)
}

/**
 * Routes that can spend or sign with the throwaway server-side keys (/api/demo, /api/agent). They need an explicit opt-in
 * (KAKUNIN_DEMO_SIGNER=1) AND a plain localhost request: anything that came through a proxy/tunnel (forwarded headers) is refused.
 */
export function demoSignerBlocked(req: Request): Response | null {
  const host = new URL(req.url).hostname
  const proxied = req.headers.has('x-forwarded-for') || req.headers.has('x-forwarded-host') || req.headers.has('forwarded')
  if (process.env.KAKUNIN_DEMO_SIGNER !== '1' || proxied || !['localhost', '127.0.0.1'].includes(host)) return json({ error: 'demo signer disabled' }, 403)
  return null
}
