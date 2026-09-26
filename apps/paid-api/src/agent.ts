// Buyer agent: pays Kakunin's x402 API per check. BEFORE it signs any payment it screens the destination address
// (and the token, and the amount) and lets the verdict decide: pay, refuse, or ask a human.
//   pnpm --filter @kakunin/paid-api agent
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateKeyToAccount } from 'viem/accounts'
import { x402Client } from '@x402/core/client'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { wrapFetchWithPayment } from '@x402/fetch'
import { decidePayment, type AddressScreener, type AddressVerdict, type Decision, type PaymentRequest, type Policy, type TokenScreener, type TokenVerdict } from '@kakunin/core'
import { getScreener, getTokenScreener } from './screener'

// Base Sepolia USDC, exactly as advertised by the x402 SDK (do not trust a token address just because a server sends it).
export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
export const POLICY: Policy = {
  trustedAssets: { 'eip155:84532': [BASE_SEPOLIA_USDC.toLowerCase()] },
  decimals: 6,
  maxAmountUsd: 0.05, // hard stop
  askAboveUsd: 0.01, // above this a human must approve
  refuseAt: 'high',
  askAt: 'medium',
}

export interface AgentEvent {
  url: string
  request: PaymentRequest
  verdict: AddressVerdict | { error: string }
  /** Intercepta Scan Token answer: null = network not covered (the allowlist decided alone) */
  tokenVerdict?: TokenVerdict | { error: string } | null
  decision: Decision
}
export interface BuyResult {
  url: string
  outcome: 'paid' | 'blocked' | 'error'
  event?: AgentEvent
  body?: unknown
  error?: string
}

export function makeAgent(opts: { signer: ReturnType<typeof privateKeyToAccount>; screener: AddressScreener; tokenScreener?: TokenScreener; policy?: Policy }) {
  const policy = opts.policy ?? POLICY
  return async function buy(url: string): Promise<BuyResult> {
    let event: AgentEvent | undefined
    const client = new x402Client()
    client.register('eip155:*', new ExactEvmScheme(opts.signer))
    client.onBeforePaymentCreation(async (context) => {
      const r = context.selectedRequirements
      const request: PaymentRequest = { payTo: r.payTo, asset: r.asset, network: r.network, amount: r.amount }
      // 1. live risk screening of the counterparty, 2. token / amount checks, 3. decision: all BEFORE signing.
      const verdict = await opts.screener.screenAddress(r.payTo).catch((e: Error) => e)
      // The token gets its own Intercepta check where the API covers the network (mainnets); the allowlist in the policy always applies.
      const token = opts.tokenScreener ? await opts.tokenScreener.screenToken(r.asset, r.network).catch((e: Error) => e) : undefined
      const decision = decidePayment(request, verdict, policy, token)
      event = {
        url, request, verdict: verdict instanceof Error ? { error: verdict.message } : verdict,
        tokenVerdict: token instanceof Error ? { error: token.message } : token, decision,
      }
      // ask-human is treated as a refusal here: an unattended agent never spends on a "maybe".
      if (decision.action !== 'pay') return { abort: true, reason: `${decision.action}: ${decision.reasons.join('; ')}` }
    })
    try {
      const res = await wrapFetchWithPayment(fetch, client)(url)
      return { url, outcome: res.ok ? 'paid' : 'error', event, body: await res.json().catch(() => null) }
    } catch (e) {
      const msg = (e as Error).message
      return { url, outcome: event && event.decision.action !== 'pay' ? 'blocked' : 'error', event, error: msg }
    }
  }
}

const show = (r: BuyResult) => {
  const ev = r.event
  console.log(`\n=== ${r.url}`)
  if (ev) {
    console.log(`  payTo   ${ev.request.payTo}   token ${ev.request.asset}   amount ${ev.request.amount} (atomic)`)
    console.log(`  verdict ${'error' in ev.verdict ? `ERROR ${ev.verdict.error}` : `${ev.verdict.risk}${ev.verdict.reasons.length ? ' — ' + ev.verdict.reasons.join('; ') : ''}`}`)
    if (ev.tokenVerdict !== undefined) console.log(`  token   ${ev.tokenVerdict === null ? 'not covered by the token scan on this network (allowlist only)' : 'error' in ev.tokenVerdict ? `ERROR ${ev.tokenVerdict.error}` : `${ev.tokenVerdict.risk} — ${ev.tokenVerdict.reasons.join('; ')}`}`)
  console.log(`  decision ${ev.decision.action.toUpperCase()} — ${ev.decision.reasons.join('; ')}`)
  }
  console.log(`  outcome ${r.outcome.toUpperCase()}${r.error ? ` (${r.error})` : ''}`)
  if (r.body) console.log('  response', JSON.stringify(r.body).slice(0, 300))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // (not `new URL('…', import.meta.url)`: webpack would try to bundle that file when the web app imports this module)
  config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true })
  const pk = process.env.AGENT_PRIVATE_KEY
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error('AGENT_PRIVATE_KEY missing in .env (run pnpm spike:wallets, then fund the agent with Base Sepolia USDC)')
  const buy = makeAgent({ signer: privateKeyToAccount(pk as `0x${string}`), screener: getScreener(), tokenScreener: getTokenScreener() })
  console.log('Kakunin agent: two purchases, each screened before signing')
  show(await buy('http://localhost:4021/check?telegramId=100000001'))
  show(await buy('http://localhost:4022/check?telegramId=100000001'))
}
