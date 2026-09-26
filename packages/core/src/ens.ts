// ENSv2 (Sepolia) helpers for the Kakunin team registry: constants, reads, writes, history from events.
// Contract facts come from docs.ens.domains/ensv2/* and the verified ABIs in ../abis (see specs/DECISIONS.md).
import {
  createPublicClient, http, keccak256, parseAbiItem, toHex, zeroAddress,
  type Account, type Address, type Hex, type PublicClient, type WalletClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { normalize, packetToBytes } from 'viem/ens'
import registryAbi from '../abis/UserRegistryImpl.json' with { type: 'json' }
import resolverAbi from '../abis/PermissionedResolverImpl.json' with { type: 'json' }
import deployment from '../../../deployments/sepolia.json' with { type: 'json' }

export const ABIS = { registry: registryAbi, resolver: resolverAbi } as const
export const DEPLOYMENT = deployment as {
  orgName: string; teamName: string; orgRegistry: Address; teamRegistry: Address; orgResolver: Address
  teamResolver: Address; orgWallet: Address; hrWallet: Address; fromBlock: number; universalResolver: Address
}

/** EAC role bits (docs.ens.domains/ensv2/permissioned-registry, /permissioned-resolver). Admin = role << 128. */
export const ROLE = {
  REGISTRAR: 1n << 0n, UNREGISTER: 1n << 12n, RENEW: 1n << 16n, SET_SUBREGISTRY: 1n << 20n, SET_RESOLVER: 1n << 24n,
  RESOLVER_SET_ADDRESS: 1n << 0n, RESOLVER_SET_TEXT: 1n << 4n,
} as const
export const HR_REGISTRY_ROLES = ROLE.REGISTRAR | ROLE.UNREGISTER | ROLE.RENEW

export const STATUS = ['AVAILABLE', 'RESERVED', 'REGISTERED'] as const
export const labelhash = (label: string): bigint => BigInt(keccak256(toHex(label)))
export const dnsName = (name: string): Hex => toHex(packetToBytes(normalize(name)))
export const memberName = (label: string, d = DEPLOYMENT) => `${label}.${d.teamName}`

export function publicClient(rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(rpc) }) as PublicClient
}

// ---------- reads ----------
export interface MemberState { status: (typeof STATUS)[number]; expiry: number; owner: Address }

export async function getMemberState(pub: PublicClient, label: string, d = DEPLOYMENT): Promise<MemberState> {
  const s = (await pub.readContract({ address: d.teamRegistry, abi: registryAbi, functionName: 'getState', args: [labelhash(label)] })) as
    { status: number; expiry: bigint; latestOwner: Address }
  return { status: STATUS[s.status], expiry: Number(s.expiry), owner: s.latestOwner }
}

/** Text record resolved through UniversalResolverV2 (the way any ENSv2 client resolves). Null if unresolvable/empty. */
export async function readText(pub: PublicClient, name: string, key: string, d = DEPLOYMENT): Promise<string | null> {
  try {
    return (await pub.getEnsText({ name: normalize(name), key, universalResolverAddress: d.universalResolver })) ?? null
  } catch {
    return null
  }
}

export async function readAddress(pub: PublicClient, name: string, d = DEPLOYMENT): Promise<Address | null> {
  try {
    return (await pub.getEnsAddress({ name: normalize(name), universalResolverAddress: d.universalResolver })) ?? null
  } catch {
    return null
  }
}

// ---------- history (ENSv2 drops unregistered names from state, so "former member" comes from events) ----------
const EV_REGISTERED = parseAbiItem('event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)')
const EV_UNREGISTERED = parseAbiItem('event LabelUnregistered(uint256 indexed tokenId, address indexed sender)')

export interface MemberRecord {
  label: string
  status: 'active' | 'former'
  registeredAt: number // unix s, first registration
  revokedAt?: number // unix s, last unregistration (former only)
}

const canon = (id: bigint) => id >> 32n // tokenId/resource/labelhash share their upper 224 bits (canonical id)

export async function listMembers(pub: PublicClient, d = DEPLOYMENT): Promise<MemberRecord[]> {
  const [reg, unreg] = await Promise.all([
    pub.getLogs({ address: d.teamRegistry, event: EV_REGISTERED, fromBlock: BigInt(d.fromBlock), toBlock: 'latest' }),
    pub.getLogs({ address: d.teamRegistry, event: EV_UNREGISTERED, fromBlock: BigInt(d.fromBlock), toBlock: 'latest' }),
  ])
  const tsCache = new Map<bigint, number>()
  const ts = async (bn: bigint) => {
    if (!tsCache.has(bn)) tsCache.set(bn, Number((await pub.getBlock({ blockNumber: bn })).timestamp))
    return tsCache.get(bn)!
  }
  const byLabel = new Map<string, { firstReg: number; lastReg: number; lastRegBlock: bigint; hash: bigint }>()
  for (const l of reg) {
    const label = l.args.label!
    const t = await ts(l.blockNumber)
    const prev = byLabel.get(label)
    byLabel.set(label, { firstReg: prev?.firstReg ?? t, lastReg: t, lastRegBlock: l.blockNumber, hash: BigInt(l.args.labelHash!) })
  }
  const out: MemberRecord[] = []
  for (const [label, m] of byLabel) {
    const state = await getMemberState(pub, label, d)
    if (state.status === 'REGISTERED') {
      out.push({ label, status: 'active', registeredAt: m.firstReg })
      continue
    }
    const un = unreg.filter((u) => canon(u.args.tokenId!) === canon(m.hash) && u.blockNumber >= m.lastRegBlock).at(-1)
    out.push({ label, status: 'former', registeredAt: m.firstReg, revokedAt: un ? await ts(un.blockNumber) : undefined })
  }
  return out.sort((a, b) => a.registeredAt - b.registeredAt)
}

// ---------- writes (every tx is announced BEFORE it is sent: network, contract, function, args) ----------
export interface TxCtx {
  pub: PublicClient
  wallet: WalletClient
  account: Account
  log?: (msg: string) => void
  /** dry-run: announce only, never send */
  dryRun?: boolean
}
const bi = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)

export async function send(ctx: TxCtx, step: string, req: { address: Address; abi: any; functionName: string; args: readonly unknown[] }) {
  const log = ctx.log ?? console.log
  const short = JSON.stringify(req.args, bi).slice(0, 300)
  log(`[${step}] as ${ctx.account.address}\n  network: sepolia | contract: ${req.address}\n  call: ${req.functionName}(${short})`)
  if (ctx.dryRun) return null
  await ctx.pub.simulateContract({ ...req, account: ctx.account } as any) // revert reasons before gas is spent
  const hash = await ctx.wallet.writeContract({ ...req, account: ctx.account, chain: sepolia } as any)
  const receipt = await ctx.pub.waitForTransactionReceipt({ hash })
  log(`  -> ${receipt.status} ${hash}`)
  if (receipt.status !== 'success') throw new Error(`${step} reverted (${hash})`)
  return receipt
}

/** HR/org: register a member subname (org keeps ownership, member holds no roles) with the team resolver. */
export async function addMember(ctx: TxCtx, label: string, d = DEPLOYMENT) {
  const state = await getMemberState(ctx.pub, label, d)
  if (state.status === 'REGISTERED') return { skipped: true as const }
  const parent = await ctx.pub.readContract({ address: d.orgRegistry, abi: registryAbi, functionName: 'getState', args: [labelhash('team')] }) as { expiry: bigint }
  const oneYear = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600)
  const expiry = parent.expiry < oneYear ? parent.expiry : oneYear
  await send(ctx, `add member ${label}`, {
    address: d.teamRegistry, abi: registryAbi, functionName: 'register',
    args: [label, d.orgWallet, zeroAddress, d.teamResolver, 0n, expiry],
  })
  return { skipped: false as const }
}

/** HR/org: revoke = unregister. The subname leaves registry state; history stays in events. */
export async function revokeMember(ctx: TxCtx, label: string, d = DEPLOYMENT) {
  const state = await getMemberState(ctx.pub, label, d)
  if (state.status !== 'REGISTERED') return { skipped: true as const }
  await send(ctx, `revoke member ${label}`, { address: d.teamRegistry, abi: registryAbi, functionName: 'unregister', args: [labelhash(label)] })
  return { skipped: false as const }
}

/** Set a text record on a member (team resolver). Skips the tx if the value is already set. */
export async function setMemberText(ctx: TxCtx, label: string, key: string, value: string, d = DEPLOYMENT) {
  const fqn = memberName(label, d)
  if ((await readText(ctx.pub, fqn, key, d)) === value) return { skipped: true as const }
  await send(ctx, `set ${key} on ${fqn}`, { address: d.teamResolver, abi: resolverAbi, functionName: 'setText', args: [dnsName(fqn), key, value] })
  return { skipped: false as const }
}

/** ORG: make the org ENS name resolve to the attester signing address (required to validate attestations). */
export async function setAttesterAddress(ctx: TxCtx, address: Address, d = DEPLOYMENT) {
  if ((await readAddress(ctx.pub, d.orgName, d))?.toLowerCase() === address.toLowerCase()) return { skipped: true as const }
  await send(ctx, `set addr(60) of ${d.orgName}`, {
    address: d.orgResolver, abi: resolverAbi, functionName: 'setAddress', args: [dnsName(d.orgName), 60n, address],
  })
  return { skipped: false as const }
}
