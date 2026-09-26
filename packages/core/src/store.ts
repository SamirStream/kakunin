// Shared off-chain store used by the bot (writes at onboarding / every interaction) and the web app (invites, alerts, orgs).
// This is the off-chain "registry" from specs/DECISIONS.md: the numeric Telegram ID is the identity, @username / display
// name are mutable and refreshed on each interaction. Two backends behind one async interface:
//   - JsonStore    : one JSON file, atomic rename. Local development (bot + web share data/store.json).
//   - UpstashStore : Redis over HTTPS REST (Upstash / Vercel Marketplace). Cloud, where the filesystem is read-only/ephemeral.
// `createStore()` picks Upstash when its env vars are present. Node-only (uses fs + fetch).
//
// Multi-organisation: every organisation has its own directory, alerts and admins (`store.forOrg(name)`). The original demo org
// ("kakunin-demo.eth") keeps the pre-multi-tenant keys, so nothing was migrated: the Store itself is the demo org's scope.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Address, Hex } from 'viem'
import type { CheckResult, DirectoryEntry } from './check'
import type { Deployment } from './ens'

/** The organisation whose data lives under the original (un-suffixed) keys. */
export const LEGACY_ORG = 'kakunin-demo.eth'

export interface Invite {
  token: string
  label: string
  createdAt: number
  usedAt?: number
  /** organisation the invite belongs to (absent on invites created before multi-org: the demo org) */
  org?: string
  /** 'member' binds a Telegram ID to a team subname; 'admin' makes the opener an alert recipient / Mini App admin of the org */
  kind?: 'member' | 'admin'
}
export interface Alert {
  id: string
  at: number
  org: string
  kind: CheckResult['status']
  /** what the victim asked about (as seen by the bot) */
  subject: { telegramId?: string; username?: string; displayName?: string }
  detail: string
}

/** A self-serve organisation: its ENSv2 deployment, who owns it, and the custodial operator key (encrypted). */
export interface OrgRecord {
  name: string
  deployment: Deployment
  /** wallet that owns the ENS name and administers the org from the dashboard */
  owner: Address
  /** Kakunin-managed key: signs attestations and runs the team registry with least-privilege EAC roles */
  operator: Address
  /** AES-GCM sealed operator private key (see crypto.ts) */
  operatorKey: string
  createdAt: number
  txs: { step: string; hash: Hex }[]
}

/** State of an org-creation run. Advanced one bounded step at a time so it fits in serverless time limits. */
export interface ProvisionJob {
  id: string
  name: string
  owner: Address
  operator: Address
  operatorKey: string
  status: 'running' | 'done' | 'failed'
  /** next task to run */
  step: string
  error?: string
  data: Record<string, string>
  txs: { step: string; hash: Hex }[]
  createdAt: number
  updatedAt: number
  /** do not advance before this time (ms): the ENS registrar's commit-reveal delay */
  notBefore?: number
}

/** Everything that belongs to ONE organisation. */
export interface OrgScope {
  directory(): Promise<DirectoryEntry[]>
  alerts(limit?: number): Promise<Alert[]>
  clearAlerts(): Promise<void>
  adminChats(): Promise<number[]>
  /** one-time Telegram deep-link tokens */
  createInvite(label: string, kind?: 'member' | 'admin'): Promise<Invite>
  upsertMember(entry: DirectoryEntry): Promise<void>
  removeMember(label: string): Promise<void>
  addAlert(a: Omit<Alert, 'id' | 'at' | 'org'> & { org?: string }): Promise<Alert>
  addOrgAdminChat(chatId: number): Promise<void>
}

/** The Store is the demo org's scope (unchanged API) plus everything that spans organisations. */
export interface Store extends OrgScope {
  forOrg(org: string): OrgScope
  peekInvite(token: string): Promise<Invite | null>
  /** returns the invite and burns it; null if unknown or already used (atomic on Upstash) */
  consumeInvite(token: string): Promise<Invite | null>
  /** Called on EVERY interaction: keeps username/display name current for known IDs, in every org. true if it changed. */
  refreshIdentity(telegramId: string, username: string | undefined, displayName: string | undefined): Promise<boolean>
  /** Organisations where this Telegram account is an admin (alert recipient, Mini App console). */
  adminOrgs(chatId: number): Promise<string[]>
  /** Organisations this numeric ID is a member of (per the off-chain directory; the chain stays the source of truth). */
  memberOrgs(telegramId: string): Promise<string[]>
  getOrg(name: string): Promise<OrgRecord | null>
  listOrgs(): Promise<OrgRecord[]>
  putOrg(org: OrgRecord): Promise<void>
  /** Reserve an org name for a creation run. false if another run already holds it. Atomic on Upstash. */
  claimName(name: string, jobId: string): Promise<boolean>
  releaseName(name: string): Promise<void>
  getJob(id: string): Promise<ProvisionJob | null>
  putJob(job: ProvisionJob): Promise<void>
}

const MAX_ALERTS = 200
const INVITE_TTL_S = 7 * 24 * 3600
const JOB_TTL_S = 7 * 24 * 3600
const newInvite = (org: string, label: string, kind: 'member' | 'admin'): Invite => ({
  token: randomBytes(12).toString('base64url'), label, createdAt: Date.now(), org, kind,
})
const newAlert = (org: string, a: Omit<Alert, 'id' | 'at' | 'org'>): Alert => ({ id: randomBytes(6).toString('hex'), at: Date.now(), ...a, org })
const normUser = (u: string | undefined) => u?.toLowerCase()
const isLegacy = (org: string) => org === LEGACY_ORG
/** Redis key suffix: none for the demo org (pre-multi-org keys), ":<name>" for everyone else. */
const sfx = (org: string) => (isLegacy(org) ? '' : `:${org}`)

// ---------------------------------------------------------------------------------------------------------------------
type Entry = DirectoryEntry & { org?: string }
interface StoreData {
  invites: Invite[]; directory: Entry[]; alerts: Alert[]; orgAdminChats: number[]
  adminsByOrg: Record<string, number[]>; orgs: OrgRecord[]; jobs: ProvisionJob[]; claims: Record<string, string>
}
const EMPTY = (): StoreData => ({ invites: [], directory: [], alerts: [], orgAdminChats: [], adminsByOrg: {}, orgs: [], jobs: [], claims: {} })
const entryOrg = (e: Entry) => e.org ?? LEGACY_ORG

export class JsonStore implements Store {
  constructor(private path: string) {}

  read(): StoreData {
    if (!existsSync(this.path)) return EMPTY()
    try {
      return { ...EMPTY(), ...JSON.parse(readFileSync(this.path, 'utf8')) }
    } catch {
      return EMPTY()
    }
  }

  /** read-modify-write with an atomic rename so the bot and the web app never see a half-written file */
  private update<T>(fn: (d: StoreData) => T): T {
    const d = this.read()
    const out = fn(d)
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(d, null, 2) + '\n')
    renameSync(tmp, this.path)
    return out
  }

  private admins(d: StoreData, org: string): number[] {
    return isLegacy(org) ? d.orgAdminChats : (d.adminsByOrg[org] ??= [])
  }

  forOrg(org: string): OrgScope {
    return {
      directory: async () => this.read().directory.filter((e) => entryOrg(e) === org).map(({ org: _o, ...e }) => e),
      alerts: async (limit = 50) => this.read().alerts.filter((a) => a.org === org).slice(0, limit),
      clearAlerts: async () => this.update((d) => void (d.alerts = d.alerts.filter((a) => a.org !== org))),
      adminChats: async () => [...this.admins(this.read(), org)],
      createInvite: async (label, kind = 'member') => this.update((d) => { const inv = newInvite(org, label, kind); d.invites.push(inv); return inv }),
      upsertMember: async (entry) => this.update((d) => {
        const i = d.directory.findIndex((e) => e.telegramId === entry.telegramId && entryOrg(e) === org)
        if (i >= 0) d.directory[i] = { ...d.directory[i], ...entry }
        else d.directory.push(isLegacy(org) ? entry : { ...entry, org })
      }),
      removeMember: async (label) => this.update((d) => void (d.directory = d.directory.filter((e) => !(e.label === label && entryOrg(e) === org)))),
      addAlert: async (a) => this.update((d) => {
        const alert = newAlert(org, a)
        d.alerts.unshift(alert)
        d.alerts = d.alerts.slice(0, MAX_ALERTS)
        return alert
      }),
      addOrgAdminChat: async (chatId) => this.update((d) => void (this.admins(d, org).includes(chatId) || this.admins(d, org).push(chatId))),
    }
  }
  private get demo() { return this.forOrg(LEGACY_ORG) }
  directory() { return this.demo.directory() }
  alerts(limit?: number) { return this.demo.alerts(limit) }
  clearAlerts() { return this.demo.clearAlerts() }
  adminChats() { return this.demo.adminChats() }
  createInvite(label: string, kind?: 'member' | 'admin') { return this.demo.createInvite(label, kind) }
  upsertMember(entry: DirectoryEntry) { return this.demo.upsertMember(entry) }
  removeMember(label: string) { return this.demo.removeMember(label) }
  addAlert(a: Omit<Alert, 'id' | 'at' | 'org'> & { org?: string }) { return this.forOrg(a.org ?? LEGACY_ORG).addAlert(a) }
  addOrgAdminChat(chatId: number) { return this.demo.addOrgAdminChat(chatId) }

  async consumeInvite(token: string) {
    return this.update((d) => {
      const inv = d.invites.find((i) => i.token === token && !i.usedAt)
      if (!inv) return null
      inv.usedAt = Date.now()
      return { ...inv }
    })
  }
  async peekInvite(token: string) { return this.read().invites.find((i) => i.token === token && !i.usedAt) ?? null }

  async refreshIdentity(telegramId: string, username: string | undefined, displayName: string | undefined) {
    return this.update((d) => {
      const u = normUser(username)
      let changed = false
      for (const e of d.directory) {
        if (e.telegramId !== telegramId) continue
        if (e.username !== u || e.displayName !== displayName) { e.username = u; e.displayName = displayName; changed = true }
      }
      return changed
    })
  }
  async adminOrgs(chatId: number) {
    const d = this.read()
    return [...(d.orgAdminChats.includes(chatId) ? [LEGACY_ORG] : []), ...Object.entries(d.adminsByOrg).filter(([, ids]) => ids.includes(chatId)).map(([o]) => o)]
  }
  async memberOrgs(telegramId: string) {
    return [...new Set(this.read().directory.filter((e) => e.telegramId === telegramId).map(entryOrg))]
  }

  async getOrg(name: string) { return this.read().orgs.find((o) => o.name === name) ?? null }
  async listOrgs() { return this.read().orgs }
  async putOrg(org: OrgRecord) {
    this.update((d) => { const i = d.orgs.findIndex((o) => o.name === org.name); if (i >= 0) d.orgs[i] = org; else d.orgs.push(org) })
  }
  async claimName(name: string, jobId: string) {
    return this.update((d) => {
      if (d.claims[name] && d.claims[name] !== jobId) return false
      d.claims[name] = jobId
      return true
    })
  }
  async releaseName(name: string) { this.update((d) => void delete d.claims[name]) }
  async getJob(id: string) { return this.read().jobs.find((j) => j.id === id) ?? null }
  async putJob(job: ProvisionJob) {
    this.update((d) => { const i = d.jobs.findIndex((j) => j.id === job.id); if (i >= 0) d.jobs[i] = job; else d.jobs.push(job) })
  }
}

// ---------------------------------------------------------------------------------------------------------------------
type Fetch = typeof fetch

/** Redis over the Upstash REST API. One command per HTTP call; single-use invites rely on GETDEL (atomic). */
export class UpstashStore implements Store {
  constructor(private url: string, private token: string, private fetchImpl: Fetch = fetch) {}

  private async cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
    const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string }
    if (!res.ok || body.error) throw new Error(`upstash ${String(args[0])} failed: ${body.error ?? res.status}`)
    return body.result as T
  }
  private static parse<T>(raw: unknown): T | null {
    if (typeof raw !== 'string') return null
    try { return JSON.parse(raw) as T } catch { return null }
  }
  private async hashValues<T>(key: string): Promise<T[]> {
    const flat = (await this.cmd<unknown>('HGETALL', key)) ?? []
    const values = Array.isArray(flat) ? flat.filter((_, i) => i % 2 === 1) : Object.values(flat as object)
    return values.map((v) => UpstashStore.parse<T>(v)).filter((e): e is T => !!e)
  }

  forOrg(org: string): OrgScope {
    const s = sfx(org)
    const dirKey = `kakunin:dir${s}`, alertKey = `kakunin:alerts${s}`, adminKey = `kakunin:admins${s}`
    return {
      directory: () => this.hashValues<DirectoryEntry>(dirKey),
      alerts: async (limit = 50) => {
        const rows = (await this.cmd<string[]>('LRANGE', alertKey, 0, limit - 1)) ?? []
        return rows.map((r) => UpstashStore.parse<Alert>(r)).filter((a): a is Alert => !!a)
      },
      clearAlerts: async () => { await this.cmd('DEL', alertKey) },
      adminChats: async () => ((await this.cmd<string[]>('SMEMBERS', adminKey)) ?? []).map(Number).filter(Number.isFinite),
      createInvite: async (label, kind = 'member') => {
        const inv = newInvite(org, label, kind)
        await this.cmd('SET', `kakunin:inv:${inv.token}`, JSON.stringify(inv), 'EX', INVITE_TTL_S)
        return inv
      },
      upsertMember: async (entry) => {
        const prev = UpstashStore.parse<DirectoryEntry>(await this.cmd('HGET', dirKey, entry.telegramId))
        await this.cmd('HSET', dirKey, entry.telegramId, JSON.stringify({ ...prev, ...entry }))
        await this.cmd('SADD', `kakunin:memberof:${entry.telegramId}`, org)
      },
      removeMember: async (label) => {
        for (const e of await this.hashValues<DirectoryEntry>(dirKey)) if (e.label === label) await this.cmd('HDEL', dirKey, e.telegramId)
      },
      addAlert: async (a) => {
        const alert = newAlert(org, a)
        await this.cmd('LPUSH', alertKey, JSON.stringify(alert))
        await this.cmd('LTRIM', alertKey, 0, MAX_ALERTS - 1)
        return alert
      },
      addOrgAdminChat: async (chatId) => {
        await this.cmd('SADD', adminKey, chatId)
        await this.cmd('SADD', `kakunin:adminof:${chatId}`, org)
      },
    }
  }
  private get demo() { return this.forOrg(LEGACY_ORG) }
  directory() { return this.demo.directory() }
  alerts(limit?: number) { return this.demo.alerts(limit) }
  clearAlerts() { return this.demo.clearAlerts() }
  adminChats() { return this.demo.adminChats() }
  createInvite(label: string, kind?: 'member' | 'admin') { return this.demo.createInvite(label, kind) }
  upsertMember(entry: DirectoryEntry) { return this.demo.upsertMember(entry) }
  removeMember(label: string) { return this.demo.removeMember(label) }
  addAlert(a: Omit<Alert, 'id' | 'at' | 'org'> & { org?: string }) { return this.forOrg(a.org ?? LEGACY_ORG).addAlert(a) }
  addOrgAdminChat(chatId: number) { return this.demo.addOrgAdminChat(chatId) }

  async peekInvite(token: string) { return UpstashStore.parse<Invite>(await this.cmd('GET', `kakunin:inv:${token}`)) }
  async consumeInvite(token: string) { return UpstashStore.parse<Invite>(await this.cmd('GETDEL', `kakunin:inv:${token}`)) }

  async refreshIdentity(telegramId: string, username: string | undefined, displayName: string | undefined) {
    const orgs = new Set(await this.memberOrgs(telegramId))
    let changed = false
    for (const org of orgs) {
      const key = `kakunin:dir${sfx(org)}`
      const e = UpstashStore.parse<DirectoryEntry>(await this.cmd('HGET', key, telegramId))
      if (!e) continue
      const u = normUser(username)
      if (e.username === u && e.displayName === displayName) continue
      await this.cmd('HSET', key, telegramId, JSON.stringify({ ...e, username: u, displayName }))
      changed = true
    }
    return changed
  }
  async adminOrgs(chatId: number) {
    const orgs = new Set((await this.cmd<string[]>('SMEMBERS', `kakunin:adminof:${chatId}`)) ?? [])
    if ((await this.adminChats()).includes(chatId)) orgs.add(LEGACY_ORG) // admins recorded before the reverse index existed
    return [...orgs]
  }
  async memberOrgs(telegramId: string) {
    const orgs = new Set((await this.cmd<string[]>('SMEMBERS', `kakunin:memberof:${telegramId}`)) ?? [])
    // Members recorded before the reverse index existed live under the demo org's key.
    if (!orgs.has(LEGACY_ORG) && (await this.cmd('HGET', 'kakunin:dir', telegramId))) orgs.add(LEGACY_ORG)
    return [...orgs]
  }

  async getOrg(name: string) { return UpstashStore.parse<OrgRecord>(await this.cmd('HGET', 'kakunin:orgs', name)) }
  listOrgs() { return this.hashValues<OrgRecord>('kakunin:orgs') }
  async putOrg(org: OrgRecord) { await this.cmd('HSET', 'kakunin:orgs', org.name, JSON.stringify(org)) }
  async claimName(name: string, jobId: string) {
    const key = `kakunin:claim:${name}`
    if ((await this.cmd('SET', key, jobId, 'NX', 'EX', JOB_TTL_S)) === 'OK') return true
    return (await this.cmd('GET', key)) === jobId
  }
  async releaseName(name: string) { await this.cmd('DEL', `kakunin:claim:${name}`) }
  async getJob(id: string) { return UpstashStore.parse<ProvisionJob>(await this.cmd('GET', `kakunin:job:${id}`)) }
  async putJob(job: ProvisionJob) { await this.cmd('SET', `kakunin:job:${job.id}`, JSON.stringify(job), 'EX', JOB_TTL_S) }
}

// ---------------------------------------------------------------------------------------------------------------------
/** Upstash when its REST env vars are set (Vercel Marketplace names or Upstash names), otherwise the local JSON file. */
export function createStore(jsonPath: string, env: Record<string, string | undefined> = process.env): Store {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new UpstashStore(url, token) : new JsonStore(env.KAKUNIN_STORE_PATH ?? jsonPath)
}
export const usingUpstash = (env: Record<string, string | undefined> = process.env) =>
  !!((env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL) && (env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN))
