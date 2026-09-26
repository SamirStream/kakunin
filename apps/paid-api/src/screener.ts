// The live screener used by the agent: the REAL Intercepta / Web3 Antivirus API. No mocks (they would not qualify for the
// prize and would defeat the point). Host, path and response shape were verified with live calls on 2026-09-26
// (`pnpm --filter @kakunin/paid-api probe`, see specs/DECISIONS.md). Unrecognised responses map to risk "unknown"
// (=> a human decides) and transport/server errors throw (=> the policy fails closed).
import type { AddressScreener, AddressVerdict, TokenScreener, TokenVerdict } from '@kakunin/core'

const HOST = process.env.INTERCEPTA_API_URL ?? 'https://api.web3antivirus.io'
export type ScanKind = 'quick-scan' | 'toxic-score'
const scanPath = (address: string, kind: ScanKind) => `/api/public/v2/extension/account/${address}/${kind}`

export async function rawScan(address: string, apiKey: string, kind: ScanKind = 'quick-scan'): Promise<{ status: number; body: unknown }> {
  const res = await fetch(HOST + scanPath(address, kind), {
    headers: { accept: 'application/json', 'x-api-key': apiKey },
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* keep text */ }
  return { status: res.status, body }
}

interface Trait { name: string; risk: number; description?: string; txsCount?: number }

// Response shape observed live: { toxicScore: 0..100, traits: [{ name, risk, description }] }.
// The API publishes no decision thresholds, so these are OURS: they only decide what the agent does with the score.
const HARD_FLAGS = new Set(['sanction_address', 'known_scammer']) // any of these => critical, whatever the score
const levelOf = (score: number): AddressVerdict['risk'] => (score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low')

/** Map a quick-scan HTTP result onto our risk levels. 404 = not an EOA (quick-scan covers EOAs only) => unknown => a human decides. */
export function verdictFromResponse(address: string, status: number, body: unknown): AddressVerdict {
  if (status === 404) return { address, risk: 'unknown', reasons: ['Intercepta quick-scan covers externally-owned accounts only (contract or unseen address)'] }
  if (status !== 200) throw new Error(`Intercepta HTTP ${status}`) // fail closed: the policy asks a human, never auto-pays
  const b = body as { toxicScore?: unknown; traits?: unknown }
  if (typeof b?.toxicScore !== 'number' || !Array.isArray(b.traits)) return { address, risk: 'unknown', reasons: ['unrecognised Intercepta response'] }
  const traits = (b.traits as Trait[]).filter((t) => t && typeof t.name === 'string' && typeof t.risk === 'number')
  const hard = traits.some((t) => HARD_FLAGS.has(t.name))
  const notable = traits.filter((t) => t.risk >= 20 || HARD_FLAGS.has(t.name)).sort((x, y) => y.risk - x.risk).slice(0, 3)
  const reasons = notable.map((t) => `${t.name} (risk ${t.risk}): ${t.description ?? ''}`.trim())
  return {
    address,
    risk: hard ? 'critical' : levelOf(b.toxicScore),
    reasons: reasons.length ? [`toxic score ${b.toxicScore}/100`, ...reasons] : [`toxic score ${b.toxicScore}/100, no significant risk trait`],
  }
}

export function getScreener(): AddressScreener {
  const key = process.env.INTERCEPTA_API_KEY
  if (!key || key === 'placeholder') throw new Error('INTERCEPTA_API_KEY missing in .env: request a free key at https://intercepta.io/ethglobal')
  return {
    async screenAddress(address) {
      const { status, body } = await rawScan(address, key)
      return verdictFromResponse(address, status, body)
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Intercepta "Scan Token": GET /api/public/v2/extension/token-intelligence/token/{address}/risks?chainId=…  (header x-api-key).
// Path and response shape were taken from the vendor docs (docs.web3antivirus.io/reference/scan-token) and CONFIRMED by live calls on
// 2026-09-27 (see specs/DECISIONS.md): mainnet USDC -> 200 riskLevel "neutral", trust "whitelist"; a non-token address -> 404
// "neither ERC-20 nor Nft"; Base Sepolia (84532) -> 400 because the chainId is not supported. Only the benign responses were observed
// live: the mapping of warn / block / blocklist below follows the documented enums and is covered by tests, not by a live example.

/** EVM chain IDs the API accepts (from its own 400 message, 2026-09-27). Anything else, testnets included, is "not covered". */
export const TOKEN_SCAN_CHAINS = new Set(['1868', '7777777', '1', '8453', '130', '146', '56', '137', '10', '42161', '480', '42220', '43114', '324', '81457', '59144', '999', '33139', '57073', '4663', '5042'])
/** CAIP-2 "eip155:8453" -> "8453" when the token scan covers it, else null. */
export const tokenScanChain = (network: string): string | null => {
  const m = /^eip155:(\d+)$/.exec(network)
  return m && TOKEN_SCAN_CHAINS.has(m[1]) ? m[1] : null
}

export async function rawTokenScan(address: string, chainId: string, apiKey: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${HOST}/api/public/v2/extension/token-intelligence/token/${address}/risks?chainId=${chainId}`, {
    headers: { accept: 'application/json', 'x-api-key': apiKey },
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* keep text */ }
  return { status: res.status, body }
}

interface Detector { code?: string; description?: string }

/** Map a Scan Token HTTP result onto our risk levels. 404 (not an ERC-20 / NFT) => unknown => a human decides; other errors throw (fail closed). */
export function tokenVerdictFromResponse(address: string, status: number, body: unknown): TokenVerdict {
  if (status === 404) return { address, risk: 'unknown', reasons: ['Intercepta does not recognise this address as an ERC-20 token'] }
  if (status !== 200) throw new Error(`Intercepta token scan HTTP ${status}`)
  const b = body as { riskScore?: unknown; riskLevel?: unknown; category?: unknown; trust?: unknown; action?: unknown; detectors?: unknown }
  if (typeof b?.riskLevel !== 'string' || typeof b?.riskScore !== 'number') return { address, risk: 'unknown', reasons: ['unrecognised Intercepta token response'] }
  const detectors = (Array.isArray(b.detectors) ? (b.detectors as Detector[]) : []).filter((d) => d && (d.code || d.description))
  const notable = detectors.slice(0, 3).map((d) => `${d.code ?? 'detector'}: ${d.description ?? ''}`.trim())
  const hard = b.action === 'block' || b.trust === 'blocklist' || b.category === 'sanctioned' || b.category === 'malicious'
  const risk: TokenVerdict['risk'] = hard ? 'critical'
    : b.trust === 'whitelist' && b.riskLevel !== 'high' ? 'low'
      : b.riskLevel === 'high' ? 'high' : b.riskLevel === 'medium' ? 'medium' : b.riskLevel === 'neutral' || b.riskLevel === 'low' ? 'low' : 'unknown'
  const head = `token risk ${b.riskLevel} (${b.riskScore}/100), trust ${String(b.trust)}, category ${String(b.category)}`
  return { address, risk, reasons: [head, ...notable] }
}

/** The live token screener: null for networks the API does not cover (testnets), so the allowlist alone decides there. */
export function getTokenScreener(): TokenScreener {
  const key = process.env.INTERCEPTA_API_KEY
  if (!key || key === 'placeholder') throw new Error('INTERCEPTA_API_KEY missing in .env: request a free key at https://intercepta.io/ethglobal')
  return {
    async screenToken(asset, network) {
      const chainId = tokenScanChain(network)
      if (!chainId) return null
      const { status, body } = await rawTokenScan(asset, chainId, key)
      return tokenVerdictFromResponse(asset, status, body)
    },
  }
}
