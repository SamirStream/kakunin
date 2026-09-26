// Authorisation for creating a Telegram invite. An invite lets whoever opens it bind THEIR Telegram ID to a member subname
// and get it attested, so creating one must be restricted to the org's HR or ORG wallet: the dashboard signs a short-lived
// message with the connected wallet and the API verifies it here (EIP-191 personal_sign). Browser-safe (viem only).
import { getAddress, recoverMessageAddress, type Address, type Hex } from 'viem'

export const INVITE_MAX_AGE_MS = 5 * 60 * 1000

export const inviteMessage = (org: string, label: string, issuedAtMs: number) =>
  `Kakunin invite\norg: ${org}\nmember: ${label}\nissued: ${issuedAtMs}`

export async function verifyInviteAuth(args: {
  org: string
  label: string
  issuedAtMs: number
  signature: Hex
  allowedSigners: Address[]
  nowMs?: number
}): Promise<{ ok: true; signer: Address } | { ok: false; reason: string }> {
  const now = args.nowMs ?? Date.now()
  if (!Number.isFinite(args.issuedAtMs) || Math.abs(now - args.issuedAtMs) > INVITE_MAX_AGE_MS) return { ok: false, reason: 'signature expired' }
  let signer: Address
  try {
    signer = await recoverMessageAddress({ message: inviteMessage(args.org, args.label, args.issuedAtMs), signature: args.signature })
  } catch {
    return { ok: false, reason: 'invalid signature' }
  }
  const allowed = args.allowedSigners.some((a) => getAddress(a) === getAddress(signer))
  return allowed ? { ok: true, signer } : { ok: false, reason: 'signer is not the org HR/ORG wallet' }
}

// ---------------------------------------------------------------------------------------------------------------------
// Dashboard actions. The owner (or, for the reference org, HR/ORG) signs a short message with their wallet; the server checks
// the signature and then acts with the organisation's operator key. The owner therefore never needs Sepolia ETH to run their team.
// A "session" signature (valid one hour) unlocks read-only private data such as the alert feed; every state change needs its own
// fresh signature (valid five minutes) naming the exact action and target.
export const ACTION_MAX_AGE_MS = 5 * 60 * 1000
export const SESSION_MAX_AGE_MS = 60 * 60 * 1000
export type DashboardAction = 'session' | 'add-member' | 'revoke-member' | 'invite' | 'telegram-admin'

export const actionMessage = (org: string, action: DashboardAction, target: string, issuedAtMs: number) =>
  `Kakunin ${action}\norg: ${org}\ntarget: ${target || '-'}\nissued: ${issuedAtMs}`

export async function verifyAction(args: {
  org: string
  action: DashboardAction
  target?: string
  issuedAtMs: number
  signature: Hex
  allowedSigners: Address[]
  nowMs?: number
}): Promise<{ ok: true; signer: Address } | { ok: false; reason: string }> {
  const now = args.nowMs ?? Date.now()
  const maxAge = args.action === 'session' ? SESSION_MAX_AGE_MS : ACTION_MAX_AGE_MS
  if (!Number.isFinite(args.issuedAtMs) || Math.abs(now - args.issuedAtMs) > maxAge) return { ok: false, reason: 'signature expired: sign again' }
  let signer: Address
  try {
    signer = await recoverMessageAddress({ message: actionMessage(args.org, args.action, args.target ?? '', args.issuedAtMs), signature: args.signature })
  } catch {
    return { ok: false, reason: 'invalid signature' }
  }
  return args.allowedSigners.some((a) => getAddress(a) === getAddress(signer)) ? { ok: true, signer } : { ok: false, reason: 'this wallet does not administer the organisation' }
}
