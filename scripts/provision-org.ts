// Create a self-serve organisation on ENSv2 Sepolia from the command line (same engine as the web wizard).
//   pnpm provision <label> <ownerAddress>
// The ORG wallet in .env is the testnet sponsor. Prints every transaction hash as it goes.
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
import { privateKeyToAccount } from 'viem/accounts'
import { publicClient } from '@kakunin/core'
import { JsonStore } from '@kakunin/core/store'
import { TASK_LABELS, advanceProvision, progressOf, startProvision, type ProvisionEnv } from '@kakunin/core/provision'

const [label, owner] = process.argv.slice(2)
if (!label || !/^0x[0-9a-fA-F]{40}$/.test(owner ?? '')) { console.error('usage: pnpm provision <label> <ownerAddress>'); process.exit(1) }
const store = new JsonStore(fileURLToPath(new URL('../data/store.json', import.meta.url)))
const env: ProvisionEnv = {
  pub: publicClient(), sponsor: privateKeyToAccount(process.env.ORG_PRIVATE_KEY as `0x${string}`),
  secret: process.env.KAKUNIN_KEY_SECRET ?? '', rpc: process.env.SEPOLIA_RPC_URL, log: (m) => console.log('  ', m),
}
const t0 = Date.now()
let job = await startProvision(store, env, { label, owner: owner as `0x${string}` })
console.log(`job ${job.id} for ${job.name}, operator ${job.operator}`)
while (job.status === 'running') {
  const p = progressOf(job)
  if (job.notBefore && job.notBefore > Date.now()) { const s = Math.ceil((job.notBefore - Date.now()) / 1000); console.log(`waiting ${s}s (commit-reveal)`); await new Promise((r) => setTimeout(r, s * 1000 + 500)) }
  console.log(`\n[${p.index + 1}/${p.total}] ${TASK_LABELS[job.step as keyof typeof TASK_LABELS]}`)
  job = (await advanceProvision(store, env, job.id))!
  if (job.error) console.log('  ! ' + job.error)
}
console.log(`\n${job.status.toUpperCase()} in ${Math.round((Date.now() - t0) / 1000)}s`)
console.log(JSON.stringify((await store.getOrg(job.name))?.deployment ?? null, null, 2))
