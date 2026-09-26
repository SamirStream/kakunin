// Generates throwaway TESTNET wallets into ../.env (gitignored). Prints addresses only, never keys.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const envPath = new URL('../.env', import.meta.url)
const examplePath = new URL('../.env.example', import.meta.url)
let env = readFileSync(existsSync(envPath) ? envPath : examplePath, 'utf8')

const out: Record<string, string> = {}
for (const key of ['ORG_PRIVATE_KEY', 'HR_PRIVATE_KEY', 'AGENT_PRIVATE_KEY']) {
  const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
  let pk = m?.[1]?.trim() ?? ''
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    pk = generatePrivateKey()
    env = m ? env.replace(m[0], `${key}=${pk}`) : `${env}\n${key}=${pk}\n`
  }
  out[key] = privateKeyToAccount(pk as `0x${string}`).address
}
writeFileSync(envPath, env)
console.log('ORG wallet (fund with Sepolia ETH):', out.ORG_PRIVATE_KEY)
console.log('HR  wallet (fund with a little Sepolia ETH):', out.HR_PRIVATE_KEY)
console.log('AGENT wallet (fund with Base Sepolia USDC, faucet.circle.com):', out.AGENT_PRIVATE_KEY)
