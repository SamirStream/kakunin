// Access rules for the routes that sign or spend with the throwaway server-side keys (demo revoke/reset, agent purchases).
// Pure decision logic (node:crypto only for a constant-time token comparison), so it is unit-tested; the web app calls it.
import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (s: string) => createHash('sha256').update(s).digest()

/** Constant-time comparison of a configured secret and what the caller sent. Missing on either side never matches. */
export function tokenMatches(expected: string | undefined, provided: string | null | undefined): boolean {
  if (!expected || !provided) return false
  return timingSafeEqual(digest(expected), digest(provided))
}

export interface DemoAccessInput {
  /** KAKUNIN_DEMO_SIGNER=1: explicit opt-in, off by default */
  enabled: boolean
  /** request hostname is localhost/127.0.0.1 */
  local: boolean
  /** request carries proxy/tunnel headers (x-forwarded-*, forwarded) */
  proxied: boolean
  /** DEMO_ADMIN_TOKEN configured on the server */
  expectedToken?: string
  /** x-demo-token header sent by the caller */
  providedToken?: string | null
}

/** State-changing demo actions (revoke / reset): explicit opt-in AND (plain localhost OR the admin token). */
export function demoSignerAllowed(i: DemoAccessInput): boolean {
  if (!i.enabled) return false
  if (i.local && !i.proxied) return true
  return tokenMatches(i.expectedToken, i.providedToken)
}

/**
 * Agent purchases spend 0.001 testnet USDC and two Intercepta calls per run. Allowed like the demo actions, or publicly when
 * KAKUNIN_AGENT_PUBLIC=1 (the caller must then rate-limit). Requires the signer opt-in either way.
 */
export function agentAllowed(i: DemoAccessInput & { publicFlag: boolean }): boolean {
  if (!i.enabled) return false
  return i.publicFlag || demoSignerAllowed(i)
}
