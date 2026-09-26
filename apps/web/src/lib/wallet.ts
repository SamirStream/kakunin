'use client'
// Browser wallet (EIP-1193) -> a core TxCtx, so the dashboard reuses exactly the same addMember/revokeMember code
// as the scripts and the bot. Sepolia only.
import { createWalletClient, custom, type Account, type Address } from 'viem'
import { sepolia } from 'viem/chains'
import { publicClient } from '@kakunin/core/ens'
import type { TxCtx } from '@kakunin/core/ens'

const SEPOLIA_HEX = '0xaa36a7'

export async function connectWallet(log: (m: string) => void): Promise<TxCtx & { address: Address }> {
  const eth = (window as unknown as { ethereum?: any }).ethereum
  if (!eth) throw new Error('No browser wallet found. Install MetaMask (or any EIP-1193 wallet) and import the HR wallet.')
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
