// Shared off-chain store used by the bot (writes at onboarding / every interaction) and the web app (invites, alerts).
// This is the off-chain "registry" from specs/DECISIONS.md: the numeric Telegram ID is the identity, @username / display
// name are mutable and refreshed on each interaction. Two backends behind one async interface:
//   - JsonStore    : one JSON file, atomic rename. Local development (bot + web share data/store.json).
//   - UpstashStore : Redis over HTTPS REST (Upstash / Vercel Marketplace). Cloud, where the filesystem is read-only/ephemeral.
// `createStore()` picks Upstash when its env vars are present. Node-only (uses fs + fetch).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { CheckResult, DirectoryEntry } from './check'

export interface Invite { token: string; label: string; createdAt: number; usedAt?: number }
export interface Alert {
  id: string
  at: number
  org: string
  kind: CheckResult['status']
  /** what the victim asked about (as seen by the bot) */
  subject: { telegramId?: string; username?: string; displayName?: string }
  detail: string
}

export interface Store {
  directory(): Promise<DirectoryEntry[]>
  alerts(limit?: number): Promise<Alert[]>
  adminChats(): Promise<number[]>
  /** one-time Telegram deep-link tokens */
  createInvite(label: string): Promise<Invite>
  peekInvite(token: string): Promise<Invite | null>
  /** returns the invite and burns it; null if unknown or already used (atomic on Upstash) */
  consumeInvite(token: string): Promise<Invite | null>
  upsertMember(entry: DirectoryEntry): Promise<void>
  /** Called on EVERY interaction: keeps username/display name current for known IDs. true if it changed. */
  refreshIdentity(telegramId: string, username: string | undefined, displayName: string | undefined): Promise<boolean>
  removeMember(label: string): Promise<void>
  addAlert(a: Omit<Alert, 'id' | 'at'>): Promise<Alert>
  addOrgAdminChat(chatId: number): Promise<void>
}

const MAX_ALERTS = 200
const INVITE_TTL_S = 7 * 24 * 3600
const newInvite = (label: string): Invite => ({ token: randomBytes(12).toString('base64url'), label, createdAt: Date.now() })
const newAlert = (a: Omit<Alert, 'id' | 'at'>): Alert => ({ id: randomBytes(6).toString('hex'), at: Date.now(), ...a })
const normUser = (u: string | undefined) => u?.toLowerCase()

// ---------------------------------------------------------------------------------------------------------------------
interface StoreData { invites: Invite[]; directory: DirectoryEntry[]; alerts: Alert[]; orgAdminChats: number[] }
const EMPTY = (): StoreData => ({ invites: [], directory: [], alerts: [], orgAdminChats: [] })

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

  async directory() { return this.read().directory }
  async alerts(limit = 50) { return this.read().alerts.slice(0, limit) }
  async adminChats() { return this.read().orgAdminChats }

  async createInvite(label: string) {
    return this.update((d) => { const inv = newInvite(label); d.invites.push(inv); return inv })
  }
  async consumeInvite(token: string) {
    return this.update((d) => {
      const inv = d.invites.find((i) => i.token === token && !i.usedAt)
      if (!inv) return null
      inv.usedAt = Date.now()
      return { ...inv }
    })
  }
  async peekInvite(token: string) { return this.read().invites.find((i) => i.token === token && !i.usedAt) ?? null }

  async upsertMember(entry: DirectoryEntry) {
    this.update((d) => {
      const i = d.directory.findIndex((e) => e.telegramId === entry.telegramId)
      if (i >= 0) d.directory[i] = { ...d.directory[i], ...entry }
      else d.directory.push(entry)
    })
  }
  async refreshIdentity(telegramId: string, username: string | undefined, displayName: string | undefined) {
    return this.update((d) => {
      const e = d.directory.find((x) => x.telegramId === telegramId)
      if (!e) return false
      const u = normUser(username)
      const changed = e.username !== u || e.displayName !== displayName
      if (changed) { e.username = u; e.displayName = displayName }
      return changed
    })
  }
  async removeMember(label: string) {
    this.update((d) => void (d.directory = d.directory.filter((e) => e.label !== label)))
  }
  async addAlert(a: Omit<Alert, 'id' | 'at'>) {
    return this.update((d) => { const alert = newAlert(a); d.alerts.unshift(alert); d.alerts = d.alerts.slice(0, MAX_ALERTS); return alert })
  }
  async addOrgAdminChat(chatId: number) {
    this.update((d) => void (d.orgAdminChats.includes(chatId) || d.orgAdminChats.push(chatId)))
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

  async directory() {
    const flat = (await this.cmd<unknown>('HGETALL', 'kakunin:dir')) ?? []
    const values = Array.isArray(flat) ? flat.filter((_, i) => i % 2 === 1) : Object.values(flat as object)
    return values.map((v) => UpstashStore.parse<DirectoryEntry>(v)).filter((e): e is DirectoryEntry => !!e)
  }
  async alerts(limit = 50) {
    const rows = (await this.cmd<string[]>('LRANGE', 'kakunin:alerts', 0, limit - 1)) ?? []
    return rows.map((r) => UpstashStore.parse<Alert>(r)).filter((a): a is Alert => !!a)
  }
  async adminChats() {
    return ((await this.cmd<string[]>('SMEMBERS', 'kakunin:admins')) ?? []).map(Number).filter(Number.isFinite)
  }

  async createInvite(label: string) {
    const inv = newInvite(label)
    await this.cmd('SET', `kakunin:inv:${inv.token}`, JSON.stringify(inv), 'EX', INVITE_TTL_S)
    return inv
  }
  async peekInvite(token: string) { return UpstashStore.parse<Invite>(await this.cmd('GET', `kakunin:inv:${token}`)) }
  async consumeInvite(token: string) { return UpstashStore.parse<Invite>(await this.cmd('GETDEL', `kakunin:inv:${token}`)) }

  async upsertMember(entry: DirectoryEntry) {
    const prev = UpstashStore.parse<DirectoryEntry>(await this.cmd('HGET', 'kakunin:dir', entry.telegramId))
    await this.cmd('HSET', 'kakunin:dir', entry.telegramId, JSON.stringify({ ...prev, ...entry }))
  }
  async refreshIdentity(telegramId: string, username: string | undefined, displayName: string | undefined) {
    const e = UpstashStore.parse<DirectoryEntry>(await this.cmd('HGET', 'kakunin:dir', telegramId))
    if (!e) return false
    const u = normUser(username)
    if (e.username === u && e.displayName === displayName) return false
    await this.cmd('HSET', 'kakunin:dir', telegramId, JSON.stringify({ ...e, username: u, displayName }))
    return true
  }
  async removeMember(label: string) {
    for (const e of await this.directory()) if (e.label === label) await this.cmd('HDEL', 'kakunin:dir', e.telegramId)
  }
  async addAlert(a: Omit<Alert, 'id' | 'at'>) {
    const alert = newAlert(a)
    await this.cmd('LPUSH', 'kakunin:alerts', JSON.stringify(alert))
    await this.cmd('LTRIM', 'kakunin:alerts', 0, MAX_ALERTS - 1)
    return alert
  }
  async addOrgAdminChat(chatId: number) { await this.cmd('SADD', 'kakunin:admins', chatId) }
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
