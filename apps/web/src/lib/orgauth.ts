// Wallet-signature authorisation for organisation admin routes (server-only). The dashboard signs a short message
// (packages/core/src/auth.ts) and sends it in two headers; the server verifies it against the organisation's admin wallets.
import type { Address } from 'viem'
import { verifyAction, type DashboardAction } from '@kakunin/core/auth'
import { isResponse, json, type OrgCtx } from './server'

export interface AdminAuth { signer: Address }
export { isResponse }

/** The caller, or a ready 401/403. `target` is the exact thing signed for (a member label, …). */
export async function requireAdmin(req: Request, ctx: OrgCtx, action: DashboardAction, target = ''): Promise<AdminAuth | Response> {
  const issued = Number(req.headers.get('x-kk-issued'))
  const signature = req.headers.get('x-kk-sig') as `0x${string}` | null
  if (!issued || !signature) return json({ error: 'signature_required', message: 'Connect your wallet and sign in.' }, 401)
  const r = await verifyAction({ org: ctx.name, action, target, issuedAtMs: issued, signature, allowedSigners: ctx.admins })
  return r.ok ? { signer: r.signer } : json({ error: 'unauthorized', message: r.reason }, 403)
}

/** True when the request carries a valid admin session for this organisation (used to decide what private detail to include). */
export async function hasAdminSession(req: Request, ctx: OrgCtx): Promise<boolean> {
  if (!req.headers.get('x-kk-sig')) return false
  return !isResponse(await requireAdmin(req, ctx, 'session'))
}
