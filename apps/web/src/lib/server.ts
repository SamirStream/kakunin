// Server-only helpers (API routes). Never import from a client component.
import { resolve } from 'node:path'
import { DEPLOYMENT, chainReader, publicClient, type DirectoryEntry } from '@kakunin/core'
import { createStore } from '@kakunin/core/store'
// Bundled at build time (no runtime fs access), so it also works on serverless hosts.
import demoDirectory from '../../../../demo/directory.json'

// Local: Next runs with cwd = apps/web and the repo root holds data/ (shared with the bot).
// Serverless (Vercel): the deployment is read-only, so the store lives in /tmp (per-instance, ephemeral: alerts only).
// Cloud: Upstash Redis when its env vars are set (persistent, shared with the Telegram webhook). Without it on Vercel the store
// falls back to /tmp (per-instance, ephemeral).
const LOCAL_PATH = process.env.VERCEL ? '/tmp/kakunin-store.json' : resolve(process.cwd(), '../../data/store.json')
export const store = createStore(LOCAL_PATH)
export const pub = publicClient(process.env.SEPOLIA_RPC_URL)
export const reader = chainReader(pub)
export const org = DEPLOYMENT.orgName
export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME || 'KakuninBot'

/** Bot-collected directory, plus the committed demo directory as a fallback so /demo works out of the box. */
export async function getDirectory(): Promise<DirectoryEntry[]> {
  const live = await store.directory()
  const demo = demoDirectory as DirectoryEntry[]
  const ids = new Set(live.map((e) => e.telegramId))
  return [...live, ...demo.filter((e) => !ids.has(e.telegramId))]
}

// Tiny TTL cache: listing members = getLogs + getBlock + text reads; the dashboard polls every few seconds.
const cache = new Map<string, { at: number; value: unknown }>()
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}
export const invalidate = (prefix = '') => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k) }

export const json = (data: unknown, init?: number | ResponseInit) =>
  Response.json(data, typeof init === 'number' ? { status: init } : init)

// ---------------------------------------------------------------------------------------------------------------------
// Public lookups shared by the v1 API, the verification profile page and the badge.
import { TELEGRAM_KEY, checkIdentity, getMemberState, listMembers, memberName, readText, type CheckResult } from '@kakunin/core'

export const LABEL_RE = /^[a-z0-9-]{1,32}$/

export interface TeamMember { label: string; fqn: string; status: 'active' | 'former'; role: string | null; since: string | null; registeredAt: number; revokedAt: number | null }

/** The team as the org publishes it on ENSv2 (public data only: no Telegram IDs or usernames). */
export function getTeam(): Promise<TeamMember[]> {
  return cached('team', 4000, async () => {
    const members = await listMembers(pub)
    return Promise.all(
      members.map(async (m) => {
        const fqn = memberName(m.label)
        const read = m.status === 'active' ? reader.readText : reader.readTextDirect
        const [role, since] = await Promise.all([read(fqn, 'org.role'), read(fqn, 'org.since')])
        return { label: m.label, fqn, status: m.status, role, since, registeredAt: m.registeredAt, revokedAt: m.revokedAt ?? null }
      }),
    )
  })
}

export type Lookup =
  | { kind: 'invalid' }
  | { kind: 'unknown' }
  | { kind: 'unattested'; fqn: string; role: string | null; since: string | null }
  | { kind: 'checked'; fqn: string; role: string | null; since: string | null; telegramId: string; result: CheckResult }

/** Everything Kakunin can say about one team label: the on-chain records, then the full verification of its attested Telegram ID. */
export function lookupMember(label: string): Promise<Lookup> {
  if (!LABEL_RE.test(label)) return Promise.resolve({ kind: 'invalid' })
  return cached(`lookup:${label}`, 5000, async (): Promise<Lookup> => {
    const fqn = memberName(label)
    const state = await getMemberState(pub, label)
    const telegramId = await reader.readTextDirect(fqn, TELEGRAM_KEY) // works for revoked names too: unregister keeps the records
    if (!telegramId) return state.status === 'REGISTERED' ? { kind: 'unattested', fqn, role: (await readText(pub, fqn, 'org.role')), since: (await readText(pub, fqn, 'org.since')) } : { kind: 'unknown' }
    const result = await checkIdentity(reader, { telegramId }, await getDirectory())
    const role = result.status === 'verified' || result.status === 'former' ? result.member.role : null
    const since = result.status === 'verified' || result.status === 'former' ? result.member.since : null
    return { kind: 'checked', fqn, role, since, telegramId, result }
  })
}
