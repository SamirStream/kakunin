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
