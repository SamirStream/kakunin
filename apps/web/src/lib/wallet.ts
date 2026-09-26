'use client'
// Browser wallet (EIP-1193). Two levels:
//   connectAccount() -> just the address and message signing (dashboard sign-in and admin actions; no gas, no network switch).
//   connectWallet()  -> a core TxCtx on Sepolia, for the few things an owner does on-chain from their own wallet (grant / revoke roles).
import { createWalletClient, custom, type Account, type Address, type Hex } from 'viem'
import { sepolia } from 'viem/chains'
import { publicClient } from '@kakunin/core/ens'
import type { TxCtx } from '@kakunin/core/ens'

const SEPOLIA_HEX = '0xaa36a7'
type Eip1193 = { request(a: { method: string; params?: unknown[] }): Promise<unknown> }
const provider = (): Eip1193 => {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum
  if (!eth) throw new Error('No browser wallet found. Install MetaMask (or any EIP-1193 wallet), or paste the owner address instead.')
  return eth
}

export interface Signer { address: Address; sign(message: string): Promise<Hex> }

export async function connectAccount(): Promise<Signer> {
  const eth = provider()
  const [address] = (await eth.request({ method: 'eth_requestAccounts' })) as Address[]
  if (!address) throw new Error('The wallet did not share an account.')
  const wallet = createWalletClient({ account: { address, type: 'json-rpc' } as Account, chain: sepolia, transport: custom(eth) })
  return { address, sign: (message) => wallet.signMessage({ account: address, message }) }
}

export async function connectWallet(log: (m: string) => void): Promise<TxCtx & { address: Address }> {
  const eth = provider()
  const [address] = (await eth.request({ method: 'eth_requestAccounts' })) as Address[]
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_HEX }] })
  } catch {
    throw new Error('Please switch your wallet to the Sepolia network.')
  }
  const account = { address, type: 'json-rpc' } as Account
  return {
    address,
    pub: publicClient(),
    account,
    wallet: createWalletClient({ account, chain: sepolia, transport: custom(eth) }),
    log,
  }
}
