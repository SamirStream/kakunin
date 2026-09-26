// Self-serve organisation creation on ENSv2 (Sepolia). Given a name and an owner wallet, this deploys and wires everything the
// reference org (kakunin-demo.eth) got from scripts/spike-ens.ts:
//
//   <name>.eth  (registered to the OWNER's wallet)  ->  org UserRegistry  ->  "team" subname  ->  team UserRegistry
//
// Ownership and power (Enhanced Access Control):
//   - the OWNER wallet owns <name>.eth and holds every role on both registries and both resolvers;
//   - a fresh OPERATOR key (sealed at rest, see crypto.ts) holds only what running the team needs: REGISTRAR|UNREGISTER|RENEW on
//     the team registry, SET_TEXT on the team resolver, SET_ADDRESS on the org resolver (it is the attestation signer, published as
//     addr(60) of <name>.eth) and, during creation only, REGISTRAR on the org registry to create "team". The owner can revoke any
//     of it on-chain whenever they want; nothing else in the org depends on Kakunin.
//   - testnet only: a sponsor wallet funds the operator with Sepolia ETH and the registrar is paid in free MockUSDC.
//
// The run is a small state machine (`ProvisionJob`) advanced ONE bounded task per call, so it fits serverless time limits and a
// browser can drive it with a progress bar. Every task is idempotent: hashes are persisted before waiting for receipts.
import {
  createWalletClient, encodeFunctionData, fallback, http, keccak256, namehash, parseEventLogs, stringToHex, toHex, zeroHash,
  encodeAbiParameters, type Address, type Hex, type LocalAccount, type PublicClient, type WalletClient,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import ethRegistrarAbi from '../abis/ETHRegistrar.json' with { type: 'json' }
import ethRegistryAbi from '../abis/ETHRegistry.json' with { type: 'json' }
import factoryAbi from '../abis/VerifiableFactory.json' with { type: 'json' }
import usdcAbi from '../abis/MockUSDC.json' with { type: 'json' }
import registryAbi from '../abis/UserRegistryImpl.json' with { type: 'json' }
import resolverAbi from '../abis/PermissionedResolverImpl.json' with { type: 'json' }
import { ENSV2, HR_REGISTRY_ROLES, ROLE, dnsName, labelhash, readAddress, rpcUrls, type Deployment } from './ens'
import { openSecret, sealSecret } from './crypto'
import type { OrgRecord, ProvisionJob, Store } from './store'

export const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n
const DURATION = 365n * 24n * 3600n
export const COMMIT_WAIT_MS = 65_000
/** Sepolia ETH sent to a new operator: enough to create the org and to run the team for a long while. */
export const FUND_WEI = 4_000_000_000_000_000n // 0.004 ETH (creation costs about 0.0015)
/** The sponsor never spends below this (it also owns the reference org). */
export const SPONSOR_RESERVE_WEI = 15_000_000_000_000_000n // 0.015 ETH
export const MAX_ORGS = 30

/** Lowercase letters, digits and single dashes, 3 to 32 chars: valid as an ENS label and as a Telegram deep-link segment. */
export const ORG_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/
const RESERVED = new Set(['kakunin', 'kakunin-demo', 'admin', 'api', 'www', 'team', 'test', 'demo'])
export function parseOrgLabel(input: string): { ok: true; label: string; name: string } | { ok: false; reason: string } {
  const label = input.trim().toLowerCase().replace(/\.eth$/, '')
  if (!ORG_LABEL_RE.test(label) || label.includes('--')) return { ok: false, reason: 'Use 3 to 32 lowercase letters, digits or single dashes (no dash at the ends).' }
  if (RESERVED.has(label)) return { ok: false, reason: `"${label}" is reserved.` }
  return { ok: true, label, name: `${label}.eth` }
}

export interface ProvisionEnv {
  pub: PublicClient
  /** pays for the operator's gas (the testnet sponsor) */
  sponsor: LocalAccount
  /** KAKUNIN_KEY_SECRET: seals the operator key */
  secret: string
  rpc?: string
  log?: (m: string) => void
}

export const TASKS = ['fund', 'deploy', 'commit', 'register', 'wire', 'verify'] as const
export type Task = (typeof TASKS)[number]
export const TASK_LABELS: Record<Task | 'done', string> = {
  fund: 'Funding the organisation key with testnet ETH',
  deploy: 'Deploying registries and resolvers (ENSv2 VerifiableFactory)',
  commit: 'Reserving the name (commit)',
  register: 'Registering the .eth name to your wallet',
  wire: 'Creating the team registry and publishing the attester',
  verify: 'Verifying the result through the Universal Resolver',
  done: 'Done',
}

const salt = (tag: string, key: Hex | Address, version = 0n) =>
  BigInt(keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: key.length === 66 ? 'bytes32' : 'address' }, { type: 'uint256' }], [keccak256(stringToHex(tag)), key as never, version])))

const walletFor = (account: LocalAccount, rpc?: string): WalletClient =>
  createWalletClient({ account, chain: sepolia, transport: fallback(rpcUrls(rpc).map((u) => http(u, { retryCount: 0, timeout: 15_000 })), { rank: false, retryCount: 1 }) })

const operatorOf = (job: ProvisionJob, env: ProvisionEnv) => privateKeyToAccount(openSecret(job.operatorKey, env.secret) as Hex)

interface Req { address: Address; abi: any; functionName: string; args: readonly unknown[] }

/**
 * Send several INDEPENDENT transactions from one account with explicit consecutive nonces, then wait for all of them. The hashes
 * are saved on the job before waiting, so a retry after a timeout waits for the same transactions instead of sending new ones.
 */
async function sendMany(env: ProvisionEnv, job: ProvisionJob, account: LocalAccount, tag: string, reqs: Req[]) {
  const key = `${tag}Pending`
  let hashes: Hex[] = job.data[key] ? JSON.parse(job.data[key]) : []
  if (!hashes.length) {
    const wallet = walletFor(account, env.rpc)
    let nonce = await env.pub.getTransactionCount({ address: account.address, blockTag: 'pending' })
    for (const r of reqs) {
      env.log?.(`[${tag}] ${r.functionName} on ${r.address} (nonce ${nonce})`)
      hashes.push(await wallet.writeContract({ ...r, account, chain: sepolia, nonce: nonce++ } as never))
    }
    job.data[key] = JSON.stringify(hashes)
    job.txs.push(...hashes.map((hash, i) => ({ step: `${tag}:${reqs[i]?.functionName ?? i}`, hash })))
  }
  const receipts = await Promise.all(hashes.map((h) => env.pub.waitForTransactionReceipt({ hash: h, timeout: 45_000 })))
  const bad = receipts.findIndex((r) => r.status !== 'success')
  if (bad >= 0) { delete job.data[key]; throw new Error(`${tag}: transaction ${hashes[bad]} reverted`) }
  delete job.data[key]
  return receipts
}

/** Creates the job: validates the name against the chain, reserves it, generates the operator key. Sends no transaction. */
export async function startProvision(store: Store, env: ProvisionEnv, input: { label: string; owner: Address }): Promise<ProvisionJob> {
  const p = parseOrgLabel(input.label)
  if (!p.ok) throw new Error(p.reason)
  if ((await store.getOrg(p.name)) || !(await isNameAvailable(env.pub, p.label))) throw new Error(`${p.name} is already registered on ENSv2 Sepolia. Pick another name.`)
  if ((await store.listOrgs()).length >= MAX_ORGS) throw new Error('This testnet deployment reached its organisation limit.')
  const balance = await env.pub.getBalance({ address: env.sponsor.address })
  if (balance < FUND_WEI + SPONSOR_RESERVE_WEI) throw new Error('The testnet sponsor is out of Sepolia ETH right now. Please try again later.')
  const id = crypto.randomUUID().replaceAll('-', '').slice(0, 20)
  if (!(await store.claimName(p.name, id))) throw new Error(`${p.name} is being created by someone else right now.`)
  const operatorKey = generatePrivateKey()
  const now = Date.now()
  const job: ProvisionJob = {
    id, name: p.name, owner: input.owner, operator: privateKeyToAccount(operatorKey).address, operatorKey: sealSecret(operatorKey, env.secret),
    status: 'running', step: 'fund', data: {}, txs: [], createdAt: now, updatedAt: now,
  }
  await store.putJob(job)
  return job
}

export const isNameAvailable = (pub: PublicClient, label: string) =>
  pub.readContract({ address: ENSV2.ethRegistrar, abi: ethRegistrarAbi, functionName: 'isAvailable', args: [label] }) as Promise<boolean>

/** Runs the next task of a job. Returns the updated job (client polls until status is 'done' or 'failed'). */
export async function advanceProvision(store: Store, env: ProvisionEnv, id: string): Promise<ProvisionJob | null> {
  const job = await store.getJob(id)
  if (!job || job.status !== 'running') return job
  if (job.notBefore && Date.now() < job.notBefore) return job
  if (Number(job.data.lockUntil ?? 0) > Date.now()) return job // another request is already running this task
  job.data.lockUntil = String(Date.now() + 55_000)
  await store.putJob(job)
  try {
    await RUN[job.step as Task](store, env, job)
    job.data.attempts = '0'
    delete job.error
  } catch (e) {
    const attempts = Number(job.data.attempts ?? 0) + 1
    job.data.attempts = String(attempts)
    job.error = (e as Error).message.split('\n')[0].slice(0, 300)
    if (attempts >= 4) { job.status = 'failed'; await store.releaseName(job.name) }
  }
  delete job.data.lockUntil
  job.updatedAt = Date.now()
  await store.putJob(job)
  return job
}

const next = (job: ProvisionJob, step: Task | 'done') => {
  job.step = step
  if (step === 'done') job.status = 'done'
}

const RUN: Record<Task, (store: Store, env: ProvisionEnv, job: ProvisionJob) => Promise<void>> = {
  // 1. The sponsor pays the operator's gas. Skipped if the operator is already funded (retry).
  async fund(_store, env, job) {
    const bal = await env.pub.getBalance({ address: job.operator })
    if (bal < FUND_WEI / 2n) {
      const wallet = walletFor(env.sponsor, env.rpc)
      const hash = await wallet.sendTransaction({ account: env.sponsor, chain: sepolia, to: job.operator, value: FUND_WEI })
      job.txs.push({ step: 'fund', hash })
      await env.pub.waitForTransactionReceipt({ hash, timeout: 45_000 })
    }
    next(job, 'deploy')
  },

  // 2. Four proxies through the VerifiableFactory (two resolvers, two registries) + registrar payment prep, in one batch.
  async deploy(_store, env, job) {
    const op = operatorOf(job, env)
    const owner = job.owner
    const label = job.name.replace(/\.eth$/, '')
    const teamName = `team.${job.name}`
    const grants = (operatorRoles: bigint) => [{ account: op.address, roleBitmap: operatorRoles }, { account: owner, roleBitmap: ALL_ROLES }]
    const resolverInit = (roles: bigint) => encodeFunctionData({ abi: resolverAbi, functionName: 'initialize', args: [grants(roles), []] })
    const registryInit = (roles: bigint) => encodeFunctionData({ abi: registryAbi, functionName: 'initialize', args: [grants(roles)] })
    const [base, premium] = (await env.pub.readContract({ address: ENSV2.ethRegistrar, abi: ethRegistrarAbi, functionName: 'getRegisterPrice', args: [label, DURATION, ENSV2.usdc] })) as [bigint, bigint]
    const price = (base + premium) * 2n
    const deploy = (impl: Address, s: bigint, data: Hex): Req => ({ address: ENSV2.factory, abi: factoryAbi, functionName: 'deployProxy', args: [impl, s, data] })
    const block = await env.pub.getBlockNumber()
    const receipts = await sendMany(env, job, op, 'deploy', [
      deploy(ENSV2.resolverImpl, salt('OwnedResolver', op.address, 0n), resolverInit(ROLE.RESOLVER_SET_ADDRESS)),
      deploy(ENSV2.resolverImpl, salt('OwnedResolver', op.address, 1n), resolverInit(ROLE.RESOLVER_SET_TEXT)),
      deploy(ENSV2.userRegistryImpl, salt('UserRegistry', namehash(job.name)), registryInit(ROLE.REGISTRAR)),
      deploy(ENSV2.userRegistryImpl, salt('UserRegistry', namehash(teamName)), registryInit(HR_REGISTRY_ROLES)),
      { address: ENSV2.usdc, abi: usdcAbi, functionName: 'mint', args: [op.address, price] },
      { address: ENSV2.usdc, abi: usdcAbi, functionName: 'approve', args: [ENSV2.ethRegistrar, price] },
    ])
    const proxy = (i: number) => (parseEventLogs({ abi: factoryAbi, eventName: 'ProxyDeployed', logs: receipts[i].logs }) as any[])[0].args.proxyAddress as Address
    job.data.orgResolver = proxy(0)
    job.data.teamResolver = proxy(1)
    job.data.orgRegistry = proxy(2)
    job.data.teamRegistry = proxy(3)
    job.data.fromBlock = String(block - 5n)
    next(job, 'commit')
  },

  // 3. Commit-reveal: the registrar wants a commitment at least a minute old before it accepts the registration.
  async commit(_store, env, job) {
    const op = operatorOf(job, env)
    const label = job.name.replace(/\.eth$/, '')
    const secret = keccak256(toHex(crypto.randomUUID()))
    job.data.secret = secret
    const commitment = (await env.pub.readContract({
      address: ENSV2.ethRegistrar, abi: ethRegistrarAbi, functionName: 'makeCommitment',
      args: [label, job.owner, secret, job.data.orgRegistry, job.data.orgResolver, DURATION, zeroHash],
    })) as Hex
    await sendMany(env, job, op, 'commit', [{ address: ENSV2.ethRegistrar, abi: ethRegistrarAbi, functionName: 'commit', args: [commitment] }])
    job.notBefore = Date.now() + COMMIT_WAIT_MS
    next(job, 'register')
  },

  // 4. The registrar registers <name>.eth to the OWNER wallet, with our org registry as its subregistry.
  async register(_store, env, job) {
    const op = operatorOf(job, env)
    const label = job.name.replace(/\.eth$/, '')
    delete job.notBefore
    if (!(await isNameAvailable(env.pub, label)) && job.data.registered !== '1') throw new Error(`${job.name} was taken while we were setting up`)
    if (job.data.registered !== '1') {
      await sendMany(env, job, op, 'register', [{
        address: ENSV2.ethRegistrar, abi: ethRegistrarAbi, functionName: 'register',
        args: [label, job.owner, job.data.secret, job.data.orgRegistry, job.data.orgResolver, DURATION, ENSV2.usdc, zeroHash],
      }])
      job.data.registered = '1'
    }
    next(job, 'wire')
  },

  // 5. "team" inside the org registry (owned by the owner wallet) and the attester address on the org name, in one batch.
  async wire(_store, env, job) {
    const op = operatorOf(job, env)
    const label = job.name.replace(/\.eth$/, '')
    const st = (await env.pub.readContract({ address: ENSV2.ethRegistry, abi: ethRegistryAbi, functionName: 'getState', args: [labelhash(label)] })) as { expiry: bigint }
    await sendMany(env, job, op, 'wire', [
      { address: job.data.orgRegistry as Address, abi: registryAbi, functionName: 'register', args: ['team', job.owner, job.data.teamRegistry, job.data.teamResolver, 0n, st.expiry] },
      { address: job.data.orgResolver as Address, abi: resolverAbi, functionName: 'setAddress', args: [dnsName(job.name), 60n, op.address] },
    ])
    next(job, 'verify')
  },

  // 6. Read it back the way any ENSv2 client would, then publish the organisation.
  async verify(store, env, job) {
    const d = deploymentOf(job)
    const attester = await readAddress(env.pub, job.name, d)
    if (attester?.toLowerCase() !== job.operator.toLowerCase()) throw new Error(`${job.name} does not resolve to the attester yet (got ${attester ?? 'nothing'})`)
    const rec: OrgRecord = { name: job.name, deployment: d, owner: job.owner, operator: job.operator, operatorKey: job.operatorKey, createdAt: Date.now(), txs: job.txs }
    await store.putOrg(rec)
    next(job, 'done')
  },
}

export function deploymentOf(job: ProvisionJob): Deployment {
  const d = job.data
  return {
    orgName: job.name, teamName: `team.${job.name}`, orgRegistry: d.orgRegistry as Address, teamRegistry: d.teamRegistry as Address,
    orgResolver: d.orgResolver as Address, teamResolver: d.teamResolver as Address, orgWallet: job.owner, hrWallet: job.operator,
    fromBlock: Number(d.fromBlock), universalResolver: ENSV2.universalResolver,
  }
}

/** Progress for a UI: which task is running and how far along the whole run is. */
export function progressOf(job: ProvisionJob) {
  const index = job.status === 'done' ? TASKS.length : Math.max(0, TASKS.indexOf(job.step as Task))
  return {
    id: job.id, name: job.name, status: job.status, step: job.step, label: TASK_LABELS[job.step as Task | 'done'] ?? job.step,
    index, total: TASKS.length, error: job.error ?? null, waitUntil: job.notBefore ?? null,
    txs: job.txs.map((t) => t.hash),
  }
}

/** The operator's signing contexts for a self-serve org: it signs attestations and acts as HR. */
export function operatorContext(rec: OrgRecord, pub: PublicClient, secret: string, rpc?: string) {
  const account = privateKeyToAccount(openSecret(rec.operatorKey, secret) as Hex)
  return { pub, account, wallet: walletFor(account, rpc), log: () => {} }
}
