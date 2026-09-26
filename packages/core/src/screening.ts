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

/** What a token-risk screener says about the payment token (Intercepta "Scan Token"). */
export interface TokenVerdict {
  address: string
  risk: Risk
  reasons: string[]
}
/**
 * Optional second opinion on the TOKEN, on top of the allowlist. Resolves to null when the network is not covered by the
 * screener (e.g. testnets): then the allowlist alone decides. Rejects on transport errors (the policy then fails closed).
 */
export interface TokenScreener {
  screenToken(asset: string, network: string): Promise<TokenVerdict | null>
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

/**
 * `token`: the token screener's answer, if one is configured. undefined = no screener, null = network not covered (the allowlist
 * decides alone), an Error = the screener failed (fail closed: a human decides).
 */
export function decidePayment(req: PaymentRequest, payTo: AddressVerdict | Error, policy: Policy, token?: TokenVerdict | Error | null): Decision {
  const reasons: string[] = []
  // 1. token: real USDC or a lookalike
  const trusted = (policy.trustedAssets[req.network] ?? []).map((a) => a.toLowerCase())
  if (!trusted.includes(req.asset.toLowerCase()))
    return { action: 'refuse', reasons: [`token ${req.asset} is not a trusted asset on ${req.network} (possible lookalike token)`] }

  // 1b. token risk (only where the screener covers the network); the allowlist above already passed
  const tokenReasons: string[] = []
  if (token instanceof Error) tokenReasons.push(`token screening unavailable (${token.message}); not paying automatically`)
  else if (token) {
    const twhy = token.reasons.length ? token.reasons.join('; ') : `risk ${token.risk}`
    if (token.risk !== 'unknown' && RANK[token.risk] >= RANK[policy.refuseAt]) return { action: 'refuse', reasons: [`token ${token.address}: ${twhy}`] }
    if (RANK[token.risk] >= RANK[policy.askAt]) tokenReasons.push(`token ${token.address}: ${token.risk === 'unknown' ? 'no risk data' : twhy}`)
  }

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

  reasons.push(...tokenReasons)
  if (value > policy.askAboveUsd) reasons.push(`amount $${value} is above the auto-approve limit of $${policy.askAboveUsd}`)
  return reasons.length ? { action: 'ask-human', reasons } : { action: 'pay', reasons: [`payTo ${payTo.address} screened ${payTo.risk}; $${value} within limits`] }
}
