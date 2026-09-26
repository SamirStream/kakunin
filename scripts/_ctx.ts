// Shared script setup: loads ../.env, builds org/HR tx contexts. Never prints keys.
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { publicClient, type TxCtx } from '@kakunin/core'

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })

export const DRY = process.argv.includes('--dry-run')
export const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
export const pub = publicClient(rpc)

function ctxFor(envKey: 'ORG_PRIVATE_KEY' | 'HR_PRIVATE_KEY'): TxCtx {
  const pk = process.env[envKey]
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error(`${envKey} missing/invalid in .env (run pnpm spike:wallets)`)
  const account = privateKeyToAccount(pk as Hex)
  return { pub, account, wallet: createWalletClient({ account, chain: sepolia, transport: http(rpc) }), dryRun: DRY }
}
export const orgCtx = () => ctxFor('ORG_PRIVATE_KEY')
export const hrCtx = () => ctxFor('HR_PRIVATE_KEY')
export const positional = () => process.argv.slice(2).filter((a) => !a.startsWith('--'))
