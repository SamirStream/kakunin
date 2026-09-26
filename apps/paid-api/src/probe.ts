// One live call per address and scan kind, prints the RAW Intercepta response (the key is never printed).
//   pnpm --filter @kakunin/paid-api probe [address ...]     address scans (quick-scan and toxic-score)
//   pnpm --filter @kakunin/paid-api probe token             token scan of real USDC on three networks, mapped and decided (read-only, no payment)
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { decidePayment } from '@kakunin/core'
import { POLICY } from './agent'
import { getTokenScreener, rawScan, type ScanKind } from './screener'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const key = process.env.INTERCEPTA_API_KEY
if (!key || key === 'placeholder') throw new Error('INTERCEPTA_API_KEY missing in .env')
const args = process.argv.slice(2)

if (args[0] === 'token') {
  // What the agent would decide about the TOKEN alone, for canonical USDC on a covered mainnet, and on the testnet we pay on.
  const screener = getTokenScreener()
  const cases: [string, string, string][] = [
    ['USDC on Ethereum', 'eip155:1', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    ['USDC on Base', 'eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
    ['USDC on Base Sepolia (our payments)', 'eip155:84532', '0x036CbD53842c5426634e7929541eC2318f3dCF7e'],
  ]
  for (const [name, network, asset] of cases) {
    const t0 = Date.now()
    const tv = await screener.screenToken(asset, network).catch((e: Error) => e)
    // policy with these tokens trusted, so we see the effect of the token scan itself
    const policy = { ...POLICY, trustedAssets: { [network]: [asset.toLowerCase()] } }
    const d = decidePayment({ payTo: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', asset, network, amount: '1000' }, { address: '0xd8dA…6045', risk: 'low', reasons: [] }, policy, tv)
    console.log(`
=== ${name}  ${network}  ${Date.now() - t0}ms
  token scan: ${tv === null ? 'not covered on this network (allowlist only)' : tv instanceof Error ? 'ERROR ' + tv.message : tv.risk + ' | ' + tv.reasons.join('; ')}
  decision:   ${d.action.toUpperCase()}`)
  }
  process.exit(0)
}
const addresses = args.length
  ? args
  : [
      '0x098B716B8Aaf21512996dC57EB0615e2383E2f96', // Ronin bridge exploiter (Lazarus): risky
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // vitalik.eth EOA: clean
    ]
for (const a of addresses) {
  for (const kind of ['quick-scan', 'toxic-score'] as ScanKind[]) {
    const t0 = Date.now()
    const { status, body } = await rawScan(a, key, kind)
    console.log(`\n=== ${a}  ${kind}  HTTP ${status}  ${Date.now() - t0}ms`)
    console.log(JSON.stringify(body).slice(0, 1200))
  }
}
