// One live call per address, prints the RAW Intercepta response (the key is never printed).
//   pnpm --filter @kakunin/paid-api probe [address ...]
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { rawQuickScan } from './screener'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const key = process.env.INTERCEPTA_API_KEY
if (!key || key === 'placeholder') throw new Error('INTERCEPTA_API_KEY missing in .env')
const args = process.argv.slice(2)
const addresses = args.length
  ? args
  : [
      '0x8589427373D6D84E98730D7795D8f6f8731FDA16', // Tornado Cash router (OFAC sanctioned): expected risky
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Circle USDC contract on mainnet: expected clean
    ]
for (const a of addresses) {
  const t0 = Date.now()
  const { status, body } = await rawQuickScan(a, key)
  console.log(`\n=== ${a}  HTTP ${status}  ${Date.now() - t0}ms`)
  console.log(JSON.stringify(body, null, 2).slice(0, 4000))
}
