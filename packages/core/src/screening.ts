// Payment screening for agent-to-agent payments (x402): decide pay / refuse / ask a human BEFORE an agent signs.
// The verdict source is pluggable (`AddressScreener`); production uses the live Intercepta API (see intercepta.ts).
// Pure and dependency-free so the policy is unit-tested exhaustively. Rule of thumb: fail CLOSED, never auto-pay
// when the screener errors or returns "unknown".

export type Risk = 'low' | 'medium' | 'high' | 'critical' | 'unknown'
const RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3, unknown: 1.5 }

export interface AddressVerdict {
  address: string
  risk: Risk
  /** human-readable reasons shown in the flow ("OFAC sanctioned", "mixer exposure", ...) */
  reasons: string[]
}
export interface AddressScreener {
  screenAddress(address: string): Promise<AddressVerdict>
}

/** The payment the agent is about to sign (x402 `PaymentRequirements`, the fields we decide on). */
export interface PaymentRequest {
  payTo: string
  asset: string
  network: string
  /** atomic units as a string (USDC has 6 decimals) */
  amount: string
  description?: string
}

export interface Policy {
  /** canonical token contracts per network (lowercase). Anything else is a lookalike token. */
  trustedAssets: Record<string, string[]>
  decimals: number
  /** refuse above this many tokens, ask a human above `askAboveUsd` */
  maxAmountUsd: number
  askAboveUsd: number
  /** risk at or above this is refused outright */
  refuseAt: Risk
  /** risk at or above this needs a human */
  askAt: Risk
}

export type Decision =
  | { action: 'pay'; reasons: string[] }
  | { action: 'refuse'; reasons: string[] }
  | { action: 'ask-human'; reasons: string[] }

export const usd = (amount: string, decimals: number) => Number(amount) / 10 ** decimals

export function decidePayment(req: PaymentRequest, payTo: AddressVerdict | Error, policy: Policy): Decision {
  const reasons: string[] = []
  // 1. token: real USDC or a lookalike
  const trusted = (policy.trustedAssets[req.network] ?? []).map((a) => a.toLowerCase())
  if (!trusted.includes(req.asset.toLowerCase()))
    return { action: 'refuse', reasons: [`token ${req.asset} is not a trusted asset on ${req.network} (possible lookalike token)`] }

  // 2. amount limits
  const value = usd(req.amount, policy.decimals)
  if (!Number.isFinite(value) || value <= 0) return { action: 'refuse', reasons: [`invalid amount ${req.amount}`] }
  if (value > policy.maxAmountUsd) return { action: 'refuse', reasons: [`amount $${value} exceeds the hard limit of $${policy.maxAmountUsd}`] }

  // 3. counterparty risk (fail closed)
  if (payTo instanceof Error) return { action: 'ask-human', reasons: [`screening unavailable (${payTo.message}); not paying automatically`] }
  const rank = RANK[payTo.risk]
  const why = payTo.reasons.length ? payTo.reasons.join('; ') : `risk ${payTo.risk}`
  if (payTo.risk !== 'unknown' && rank >= RANK[policy.refuseAt]) return { action: 'refuse', reasons: [`payTo ${payTo.address}: ${why}`] }
  if (rank >= RANK[policy.askAt]) reasons.push(`payTo ${payTo.address}: ${payTo.risk === 'unknown' ? 'no risk data' : why}`)

  if (value > policy.askAboveUsd) reasons.push(`amount $${value} is above the auto-approve limit of $${policy.askAboveUsd}`)
  return reasons.length ? { action: 'ask-human', reasons } : { action: 'pay', reasons: [`payTo ${payTo.address} screened ${payTo.risk}; $${value} within limits`] }
}
