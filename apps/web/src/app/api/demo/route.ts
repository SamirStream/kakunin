import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { revokeDemoMember, seedDemo } from '@kakunin/core'
import { invalidate, json, pub } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Server-side demo signer: uses the THROWAWAY testnet HR/ORG keys from .env so the live demo can revoke/reset in one
// click. Disabled unless KAKUNIN_DEMO_SIGNER=1 and the request comes from localhost — never enable on a public host.
const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const ctx = (key: string) => {
  const account = privateKeyToAccount(process.env[key] as Hex)
  return { pub, account, wallet: createWalletClient({ account, chain: sepolia, transport: http(rpc) }), log: () => {} }
}

export async function POST(req: Request) {
  const host = new URL(req.url).hostname
  if (process.env.KAKUNIN_DEMO_SIGNER !== '1' || !['localhost', '127.0.0.1'].includes(host)) return json({ error: 'demo signer disabled' }, 403)
  const { action, label } = (await req.json().catch(() => ({}))) as { action?: string; label?: string }
  const hr = ctx('HR_PRIVATE_KEY')
  if (action === 'revoke' && label) await revokeDemoMember(hr, label)
  else if (action === 'reset') await seedDemo(ctx('ORG_PRIVATE_KEY'), hr)
  else return json({ error: 'unknown action' }, 400)
  invalidate('members')
  return json({ ok: true, action, label })
}
