// One live call per address and scan kind, prints the RAW Intercepta response (the key is never printed).
//   pnpm --filter @kakunin/paid-api probe [address ...]
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { rawScan, type ScanKind } from './screener'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const key = process.env.INTERCEPTA_API_KEY
if (!key || key === 'placeholder') throw new Error('INTERCEPTA_API_KEY missing in .env')
const args = process.argv.slice(2)
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
