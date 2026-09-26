// Buyer agent: pays Kakunin's x402 API per check. BEFORE it signs any payment it screens the destination address
// (and the token, and the amount) and lets the verdict decide: pay, refuse, or ask a human.
//   pnpm --filter @kakunin/paid-api agent
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { privateKeyToAccount } from 'viem/accounts'
import { x402Client } from '@x402/core/client'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { wrapFetchWithPayment } from '@x402/fetch'
import { decidePayment, type AddressScreener, type AddressVerdict, type Decision, type PaymentRequest, type Policy } from '@kakunin/core'
import { getScreener } from './screener'

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
  decision: Decision
}
export interface BuyResult {
  url: string
  outcome: 'paid' | 'blocked' | 'error'
  event?: AgentEvent
  body?: unknown
  error?: string
}

export function makeAgent(opts: { signer: ReturnType<typeof privateKeyToAccount>; screener: AddressScreener; policy?: Policy }) {
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
      const decision = decidePayment(request, verdict, policy)
      event = { url, request, verdict: verdict instanceof Error ? { error: verdict.message } : verdict, decision }
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
    console.log(`  decision ${ev.decision.action.toUpperCase()} — ${ev.decision.reasons.join('; ')}`)
  }
  console.log(`  outcome ${r.outcome.toUpperCase()}${r.error ? ` (${r.error})` : ''}`)
  if (r.body) console.log('  response', JSON.stringify(r.body).slice(0, 300))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })
  const pk = process.env.AGENT_PRIVATE_KEY
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error('AGENT_PRIVATE_KEY missing in .env (run pnpm spike:wallets, then fund the agent with Base Sepolia USDC)')
  const buy = makeAgent({ signer: privateKeyToAccount(pk as `0x${string}`), screener: getScreener() })
  console.log('Kakunin agent: two purchases, each screened before signing')
  show(await buy('http://localhost:4021/check?telegramId=100000001'))
  show(await buy('http://localhost:4022/check?telegramId=100000001'))
}
