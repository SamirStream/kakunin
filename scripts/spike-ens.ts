// SPIKE 1 — ENSv2 Sepolia: org name + org registry + team registry + HR delegation + member add/revoke.
// Default = DRY RUN (prints every tx that would be sent). Pass --send to execute.
// Idempotent: progress is stored in scripts/state.sepolia.json, finished steps are skipped.
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex, stringToHex, namehash,
  encodeAbiParameters, encodeFunctionData, parseEventLogs, zeroAddress, zeroHash, type Address, type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { packetToBytes } from 'viem/ens'

const abi = (n: string) => JSON.parse(readFileSync(new URL(`../packages/core/abis/${n}.json`, import.meta.url), 'utf8'))
const A = {
  ethRegistrar: '0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca',
  ethRegistry: '0x657ea849311d3d5823348dded7c2aaafb3ede09e',
  userRegistryImpl: '0xa80338aaa8d23831cea25e858d1774534abb0263',
  resolverImpl: '0x14f09fd05d4585759e54844dc9b00147131cf243',
  factory: '0x9e726eb570beb6bceb495ab8cda7df517d4e841c',
  usdc: '0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e',
} as const satisfies Record<string, Address>
const ABI = {
  ethRegistrar: abi('ETHRegistrar'), registry: abi('UserRegistryImpl'), resolver: abi('PermissionedResolverImpl'),
  factory: abi('VerifiableFactory'), usdc: abi('MockUSDC'), ethRegistry: abi('ETHRegistry'),
}

// EAC roles (docs.ens.domains/ensv2/permissioned-registry & permissioned-resolver)
const ROLE = {
  REGISTRAR: 1n << 0n, UNREGISTER: 1n << 12n, RENEW: 1n << 16n, SET_SUBREGISTRY: 1n << 20n, SET_RESOLVER: 1n << 24n,
  SET_TEXT: 1n << 4n,
}
const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n
const HR_REGISTRY_ROLES = ROLE.REGISTRAR | ROLE.UNREGISTER | ROLE.RENEW

const SEND = process.argv.includes('--send')
const RPC = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const ORG_NAME = process.env.ORG_ENS_NAME ?? 'kakunin-demo.eth'
const ORG_LABEL = ORG_NAME.replace(/\.eth$/, '')
const TEAM_NAME = `team.${ORG_NAME}`
const MEMBER = process.env.SPIKE_MEMBER ?? 'alice'
const org = privateKeyToAccount(process.env.ORG_PRIVATE_KEY as Hex)
const hr = privateKeyToAccount(process.env.HR_PRIVATE_KEY as Hex)
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
const wallet = (account: typeof org) => createWalletClient({ account, chain: sepolia, transport: http(RPC) })

const STATE_FILE = new URL('./state.sepolia.json', import.meta.url)
const state: Record<string, string> = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
const bi = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)

async function tx(step: string, who: typeof org, req: { address: Address; abi: any; functionName: string; args: readonly unknown[] }) {
  console.log(`\n[${step}] as ${who === org ? 'ORG' : 'HR'} ${who.address}\n  network: sepolia | contract: ${req.address}\n  call: ${req.functionName}(${JSON.stringify(req.args, bi)})`)
  if (!SEND) return null
  await pub.simulateContract({ ...req, account: who } as any) // surfaces revert reasons before spending gas
  const hash = await wallet(who).writeContract(req as any)
  const receipt = await pub.waitForTransactionReceipt({ hash })
  console.log(`  -> ${receipt.status} ${hash}`)
  if (receipt.status !== 'success') throw new Error(`${step} reverted`)
  return receipt
}

const dnsName = (n: string) => toHex(packetToBytes(n))
const salt = (tag: string, key: Hex | Address, version = 0n) =>
  BigInt(keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: key.length === 66 ? 'bytes32' : 'address' }, { type: 'uint256' }], [keccak256(stringToHex(tag)), key as any, version])))

async function deployProxy(step: string, impl: Address, s: bigint, data: Hex, key: string) {
  if (state[key]) return state[key] as Address
  const r = await tx(step, org, { address: A.factory, abi: ABI.factory, functionName: 'deployProxy', args: [impl, s, data] })
  if (!r) return `<${key}>` as Address
  const [log] = parseEventLogs({ abi: ABI.factory, eventName: 'ProxyDeployed', logs: r.logs }) as any[]
  state[key] = log.args.proxyAddress
  save()
  return state[key] as Address
}

async function main() {
  console.log(`Kakunin ENSv2 spike — ${SEND ? 'SEND MODE' : 'DRY RUN (add --send to execute)'}\norg=${org.address} hr=${hr.address} name=${ORG_NAME}`)
  console.log(`ETH balances: org=${await pub.getBalance({ address: org.address })} hr=${await pub.getBalance({ address: hr.address })}`)

  // 1. Resolvers: one for the org root name, a separate one for the team (HR gets SET_TEXT only there).
  const orgResolver = await deployProxy('1a deploy org resolver', A.resolverImpl, salt('OwnedResolver', org.address, 0n),
    encodeFunctionData({ abi: ABI.resolver, functionName: 'initialize', args: [[{ account: org.address, roleBitmap: ALL_ROLES }], []] }), 'orgResolver')
  const teamResolver = await deployProxy('1b deploy team resolver', A.resolverImpl, salt('OwnedResolver', org.address, 1n),
    encodeFunctionData({ abi: ABI.resolver, functionName: 'initialize', args: [[{ account: org.address, roleBitmap: ALL_ROLES }, { account: hr.address, roleBitmap: ROLE.SET_TEXT }], []] }), 'teamResolver')

  // 2. Registries (UserRegistry proxies). Salt = keccak("UserRegistry", namehash(name), version)
  const regInit = encodeFunctionData({ abi: ABI.registry, functionName: 'initialize', args: [[{ account: org.address, roleBitmap: ALL_ROLES }]] })
  const orgRegistry = await deployProxy('2a deploy org registry', A.userRegistryImpl, salt('UserRegistry', namehash(ORG_NAME)), regInit, 'orgRegistry')
  const teamRegistry = await deployProxy('2b deploy team registry', A.userRegistryImpl, salt('UserRegistry', namehash(TEAM_NAME)), regInit, 'teamRegistry')

  // 3. Register <org>.eth (MockUSDC, commit-reveal) with orgRegistry as subregistry
  const label = ORG_LABEL
  const duration = 365n * 24n * 3600n
  const available = await pub.readContract({ address: A.ethRegistrar, abi: ABI.ethRegistrar, functionName: 'isAvailable', args: [label] }) as boolean
  if (!state.orgRegistered && available) {
    const [base, premium] = await pub.readContract({ address: A.ethRegistrar, abi: ABI.ethRegistrar, functionName: 'getRegisterPrice', args: [label, duration, A.usdc] }) as [bigint, bigint]
    console.log(`price for ${label}.eth: base=${base} premium=${premium} (MockUSDC, 6 decimals)`)
    await tx('3a mint MockUSDC', org, { address: A.usdc, abi: ABI.usdc, functionName: 'mint', args: [org.address, (base + premium) * 2n] })
    await tx('3b approve registrar', org, { address: A.usdc, abi: ABI.usdc, functionName: 'approve', args: [A.ethRegistrar, base + premium] })
    const secret = (state.secret as Hex) ?? keccak256(toHex(crypto.randomUUID()))
    state.secret = secret; if (SEND) save()
    const commitArgs = [label, org.address, secret, orgRegistry, orgResolver, duration, zeroHash] as const
    const commitment = await pub.readContract({ address: A.ethRegistrar, abi: ABI.ethRegistrar, functionName: 'makeCommitment', args: commitArgs }).catch(() => zeroHash) as Hex
    await tx('3c commit', org, { address: A.ethRegistrar, abi: ABI.ethRegistrar, functionName: 'commit', args: [commitment] })
    if (SEND) { console.log('  waiting 65s (MIN_COMMITMENT_AGE=60s)…'); await new Promise((r) => setTimeout(r, 65_000)) }
    await tx('3d register', org, { address: A.ethRegistrar, abi: ABI.ethRegistrar, functionName: 'register', args: [label, org.address, secret, orgRegistry, orgResolver, duration, A.usdc, zeroHash] })
    if (SEND) { state.orgRegistered = 'true'; save() }
  } else console.log(`\n[3] ${label}.eth ${state.orgRegistered ? 'already registered by us (state)' : 'NOT available (taken) — change ORG_ENS_NAME'}`)

  // 4. team.<org>.eth inside orgRegistry, pointing to teamRegistry
  const orgExpiry = SEND || state.orgRegistered ? ((await pub.readContract({ address: A.ethRegistry, abi: ABI.ethRegistry, functionName: 'getState', args: [BigInt(keccak256(toHex(label)))] }).catch(() => null)) as any)?.expiry as bigint | undefined : undefined
  console.log(`\n${ORG_NAME} expiry: ${orgExpiry ?? '(unknown in dry run)'}`)
  if (!state.teamRegistered) {
    await tx('4 register team subname', org, { address: orgRegistry, abi: ABI.registry, functionName: 'register', args: ['team', org.address, teamRegistry, teamResolver, ALL_ROLES, orgExpiry ?? 0n] })
    if (SEND) { state.teamRegistered = 'true'; save() }
  }

  // 5. EAC delegation: HR gets REGISTRAR|UNREGISTER|RENEW on the team registry ROOT only
  if (!state.hrGranted) {
    await tx('5 grant HR roles on team registry', org, { address: teamRegistry, abi: ABI.registry, functionName: 'grantRootRoles', args: [HR_REGISTRY_ROLES, hr.address] })
    if (SEND) { state.hrGranted = 'true'; save() }
  }

  // 6. HR adds a member (org keeps ownership of the subname) and sets text records
  const memberFqn = `${MEMBER}.${TEAM_NAME}`
  const tomorrow = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600)
  await tx('6a HR registers member', hr, { address: teamRegistry, abi: ABI.registry, functionName: 'register', args: [MEMBER, org.address, zeroAddress, teamResolver, 0n, orgExpiry && orgExpiry < tomorrow ? orgExpiry : tomorrow] })
  await tx('6b HR sets org.role', hr, { address: teamResolver, abi: ABI.resolver, functionName: 'setText', args: [dnsName(memberFqn), 'org.role', 'Engineer'] })

  // 7. Negative tests (must revert): HR can't touch the org root name or the org registry
  if (SEND) {
    for (const [what, req] of [
      ['HR unregister "team" in org registry', { address: orgRegistry, abi: ABI.registry, functionName: 'unregister', args: [BigInt(keccak256(toHex('team')))] }],
      ['HR setResolver on org registry', { address: orgRegistry, abi: ABI.registry, functionName: 'setResolver', args: [BigInt(keccak256(toHex('team'))), hr.address] }],
    ] as const) {
      const ok = await pub.simulateContract({ ...(req as any), account: hr }).then(() => false, (e) => { console.log(`\n[7] ${what}: reverted as expected (${(e as Error).message.split('\n')[0]})`); return true })
      if (!ok) throw new Error(`${what} should have reverted`)
    }
  }
  // 8. Read back + revoke
  console.log(`\n[8] read: text(${memberFqn}, org.role) via resolver.resolve…`)
  if (SEND) {
    const q = encodeFunctionData({ abi: parseAbi(['function text(bytes32 node, string key) view returns (string)']), functionName: 'text', args: [namehash(memberFqn), 'org.role'] })
    const raw = await pub.readContract({ address: teamResolver, abi: ABI.resolver, functionName: 'resolve', args: [dnsName(memberFqn), q] })
    console.log('  raw resolve() result:', raw)
    const st = await pub.readContract({ address: teamRegistry, abi: ABI.registry, functionName: 'getState', args: [BigInt(keccak256(toHex(MEMBER)))] })
    console.log('  member state before revoke:', JSON.stringify(st, bi))
  }
  await tx('8 HR revokes member (unregister)', hr, { address: teamRegistry, abi: ABI.registry, functionName: 'unregister', args: [BigInt(keccak256(toHex(MEMBER)))] })
  if (SEND) console.log('  member state after revoke:', JSON.stringify(await pub.readContract({ address: teamRegistry, abi: ABI.registry, functionName: 'getState', args: [BigInt(keccak256(toHex(MEMBER)))] }), bi))
  console.log(SEND ? '\nDONE. Log results in specs/DECISIONS.md' : '\nDRY RUN complete — nothing was sent.')
}
main().catch((e) => { console.error(e); process.exit(1) })
