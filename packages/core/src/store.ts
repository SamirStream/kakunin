// Tiny JSON-file store shared by the bot (writes at onboarding / every interaction) and the web dashboard
// (invites, alerts). This is the off-chain "registry" from specs/DECISIONS.md: numeric Telegram ID is the identity,
// @username / display name are mutable and refreshed on each interaction. Node-only (uses fs).
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
export interface StoreData { invites: Invite[]; directory: DirectoryEntry[]; alerts: Alert[]; orgAdminChats: number[] }

const EMPTY = (): StoreData => ({ invites: [], directory: [], alerts: [], orgAdminChats: [] })

export class JsonStore {
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
  update<T>(fn: (d: StoreData) => T): T {
    const d = this.read()
    const out = fn(d)
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(d, null, 2) + '\n')
    renameSync(tmp, this.path)
    return out
  }

  // --- invites (one-time deep-link tokens) ---
  createInvite(label: string): Invite {
    return this.update((d) => {
      const invite: Invite = { token: randomBytes(12).toString('base64url'), label, createdAt: Date.now() }
      d.invites.push(invite)
      return invite
    })
  }
  /** Returns the invite and marks it used; null if unknown or already used. */
  consumeInvite(token: string): Invite | null {
    return this.update((d) => {
      const inv = d.invites.find((i) => i.token === token && !i.usedAt)
      if (!inv) return null
      inv.usedAt = Date.now()
      return { ...inv }
    })
  }
  peekInvite(token: string): Invite | null {
    return this.read().invites.find((i) => i.token === token && !i.usedAt) ?? null
  }

  // --- directory: Telegram ID -> member label (+ mutable username/displayName) ---
  upsertMember(entry: DirectoryEntry) {
    this.update((d) => {
      const i = d.directory.findIndex((e) => e.telegramId === entry.telegramId)
      if (i >= 0) d.directory[i] = { ...d.directory[i], ...entry }
      else d.directory.push(entry)
    })
  }
  /** Called on EVERY interaction: keeps username/display name current for known IDs. Returns true if it changed. */
  refreshIdentity(telegramId: string, username: string | undefined, displayName: string | undefined): boolean {
    return this.update((d) => {
      const e = d.directory.find((x) => x.telegramId === telegramId)
      if (!e) return false
      const u = username?.toLowerCase()
      const changed = e.username !== u || e.displayName !== displayName
      if (changed) { e.username = u; e.displayName = displayName }
      return changed
    })
  }
  removeMember(label: string) {
    this.update((d) => void (d.directory = d.directory.filter((e) => e.label !== label)))
  }

  // --- alerts (impersonation attempts) ---
  addAlert(a: Omit<Alert, 'id' | 'at'>): Alert {
    return this.update((d) => {
      const alert: Alert = { id: randomBytes(6).toString('hex'), at: Date.now(), ...a }
      d.alerts.unshift(alert)
      d.alerts = d.alerts.slice(0, 200)
      return alert
    })
  }
  addOrgAdminChat(chatId: number) {
    this.update((d) => void (d.orgAdminChats.includes(chatId) || d.orgAdminChats.push(chatId)))
  }
}
