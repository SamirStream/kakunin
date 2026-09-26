// One place that turns an organisation NAME into everything needed to act on it: where it lives on ENSv2, its off-chain scope, who
// administers it, and the keys that sign for it. Shared by the web app and the Telegram bot so both behave identically.
//   - the reference organisation (kakunin-demo.eth) uses the throwaway ORG/HR keys from the environment;
//   - every self-serve organisation uses its sealed operator key (see provision.ts, crypto.ts).
// Node-only; exported as `@kakunin/core/orgs`.
import { createWalletClient, http, type Address, type Hex, type LocalAccount, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { chainReader, type Reader } from './check'
import { DEPLOYMENT, type Deployment, type TxCtx } from './ens'
import { operatorContext } from './provision'
import type { OrgRecord, OrgScope, Store } from './store'

/** Everything the routes and the bot need to act on ONE organisation. */
export interface OrgRuntime {
  name: string
  d: Deployment
  /** the reference organisation: sandbox controls and its public alert feed are allowed */
  demo: boolean
  scope: OrgScope
  reader: Reader
  /** wallets allowed to sign dashboard actions */
  admins: Address[]
  record: OrgRecord | null
  /** attester signs attestations (the org's ENS name resolves to it); hr runs the team registry. Both are the operator for self-serve orgs. */
  signers(): { attester: TxCtx & { account: LocalAccount }; hr: TxCtx }
}

export const ORG_NAME_RE = /^[a-z0-9-]{3,32}\.eth$/

export interface OrgResolverConfig {
  store: Store
  pub: PublicClient
  rpc?: string
  /** KAKUNIN_KEY_SECRET */
  secret?: string
  /** env keys of the reference organisation */
  orgKey?: Hex
  hrKey?: Hex
  /** how long an organisation record is kept in memory */
  ttlMs?: number
}

export function createOrgResolver(cfg: OrgResolverConfig) {
  const { store, pub } = cfg
  const rpc = cfg.rpc ?? 'https://ethereum-sepolia-rpc.publicnode.com'
  const readers = new Map<string, Reader>()
  const readerFor = (d: Deployment) => {
    let r = readers.get(d.orgName)
    if (!r) readers.set(d.orgName, (r = chainReader(pub, d)))
    return r
  }
  const envCtx = (key: Hex | undefined, label: string) => {
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${label} is not configured`)
    const account = privateKeyToAccount(key)
    return { pub, account, wallet: createWalletClient({ account, chain: sepolia, transport: http(rpc) }), log: () => {} }
  }
  const recs = new Map<string, { at: number; rec: OrgRecord | null }>()
  const record = async (name: string) => {
    const hit = recs.get(name)
    if (hit && Date.now() - hit.at < (cfg.ttlMs ?? 4000)) return hit.rec
    const rec = await store.getOrg(name)
    recs.set(name, { at: Date.now(), rec })
    return rec
  }

  const demo = (): OrgRuntime => ({
    name: DEPLOYMENT.orgName, d: DEPLOYMENT, demo: true, scope: store, reader: readerFor(DEPLOYMENT), record: null,
    admins: [DEPLOYMENT.hrWallet, DEPLOYMENT.orgWallet],
    signers: () => ({ attester: envCtx(cfg.orgKey, 'ORG_PRIVATE_KEY'), hr: envCtx(cfg.hrKey, 'HR_PRIVATE_KEY') }),
  })

  return {
    /** The organisation named `name` (the reference org when empty), or null if Kakunin does not know it. */
    async get(name?: string | null): Promise<OrgRuntime | null> {
      const n = (name ?? '').trim().toLowerCase() || DEPLOYMENT.orgName
      if (n === DEPLOYMENT.orgName) return demo()
      if (!ORG_NAME_RE.test(n)) return null
      const rec = await record(n)
      if (!rec) return null
      return {
        name: n, d: rec.deployment, demo: false, scope: store.forOrg(n), reader: readerFor(rec.deployment), record: rec, admins: [rec.owner],
        signers: () => {
          const op = operatorContext(rec, pub, cfg.secret ?? '', rpc)
          return { attester: op as never, hr: op as never }
        },
      }
    },
    /** Names of every organisation Kakunin knows, the reference org first. */
    async names(): Promise<string[]> {
      return [DEPLOYMENT.orgName, ...(await store.listOrgs()).sort((a, b) => a.createdAt - b.createdAt).map((o) => o.name)]
    },
    forget: (name: string) => void recs.delete(name),
  }
}
export type OrgResolver = ReturnType<typeof createOrgResolver>
