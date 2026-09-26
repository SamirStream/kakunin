// Server-only helpers (API routes). Never import from a client component.
import { resolve } from 'node:path'
import { createWalletClient, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import {
  DEPLOYMENT, TELEGRAM_KEY, checkIdentity, getMemberState, listMembers, memberName, publicClient, readText,
  type CheckResult, type DirectoryEntry,
} from '@kakunin/core'
import { confirmedImpersonators, createStore } from '@kakunin/core/store'
import { createOrgResolver, type OrgRuntime } from '@kakunin/core/orgs'
// Bundled at build time (no runtime fs access), so it also works on serverless hosts.
import demoDirectory from '../../../../demo/directory.json'

// Local: Next runs with cwd = apps/web and the repo root holds data/ (shared with the bot).
// Serverless (Vercel): the deployment is read-only, so the store lives in /tmp (per-instance, ephemeral: alerts only).
// Cloud: Upstash Redis when its env vars are set (persistent, shared with the Telegram webhook). Without it on Vercel the store
// falls back to /tmp (per-instance, ephemeral).
const LOCAL_PATH = process.env.VERCEL ? '/tmp/kakunin-store.json' : resolve(process.cwd(), '../../data/store.json')
export const store = createStore(LOCAL_PATH)
export const pub = publicClient(process.env.SEPOLIA_RPC_URL)
/** The reference organisation (kakunin-demo.eth). Every other organisation is resolved with `getOrg`. */
export const org = DEPLOYMENT.orgName
export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME || 'KakuninBot'
export const keySecret = () => process.env.KAKUNIN_KEY_SECRET ?? ''

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
// Organisations (shared resolver: packages/core/src/orgs.ts, also used by the Telegram bot)
export type OrgCtx = OrgRuntime
export const orgs = createOrgResolver({
  store, pub, rpc: process.env.SEPOLIA_RPC_URL, secret: process.env.KAKUNIN_KEY_SECRET,
  orgKey: process.env.ORG_PRIVATE_KEY as Hex | undefined, hrKey: process.env.HR_PRIVATE_KEY as Hex | undefined,
})

/** Resolve an organisation by ENS name; the reference org when no name is given. null if Kakunin does not know it. */
export const getOrg = (name?: string | null) => orgs.get(name)
export const dropOrg = (name: string) => orgs.forget(name)

/** Organisation named in `?org=` (or the JSON body), as a ready 404 when unknown. */
export async function orgOr404(name: string | null | undefined): Promise<OrgCtx | Response> {
  return (await getOrg(name)) ?? json({ error: 'org_not_found', message: `Kakunin does not know ${name}. Create it at /create.` }, 404)
}
export const isResponse = (x: unknown): x is Response => x instanceof Response

/** Signing contexts of an organisation: env keys for the reference org, the sealed operator key for the others. */
export const orgSigners = (ctx: OrgCtx) => ctx.signers()

/** HR / ORG signing contexts from the server env (throwaway testnet keys). Used by the reference org and the testnet sponsor. */
export function envSigner(envKey: 'HR_PRIVATE_KEY' | 'ORG_PRIVATE_KEY') {
  const pk = process.env[envKey]
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error(`${envKey} is not configured`)
  const account = privateKeyToAccount(pk as Hex)
  const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
  return { pub, account, wallet: createWalletClient({ account, chain: sepolia, transport: http(rpc) }), log: () => {} }
}

/** Bot-collected directory. The reference org also gets the committed demo directory as a fallback so /demo works out of the box. */
export async function getDirectory(ctx: OrgCtx): Promise<DirectoryEntry[]> {
  const live = await ctx.scope.directory()
  if (!ctx.demo) return live
  const ids = new Set(live.map((e) => e.telegramId))
  return [...live, ...(demoDirectory as DirectoryEntry[]).filter((e) => !ids.has(e.telegramId))]
}

/** The check engine with everything the organisation knows: its directory and the impersonators its admins confirmed. */
export async function checkFor(ctx: OrgCtx, input: { telegramId?: string; username?: string; displayName?: string }): Promise<CheckResult> {
  const [directory, reports] = await Promise.all([getDirectory(ctx), ctx.scope.reports()])
  return checkIdentity(ctx.reader, input, directory, { impersonators: confirmedImpersonators(reports) })
}

/** Best-effort Telegram message to every admin chat of an organisation (the web app has the bot token too). */
export async function notifyAdmins(ctx: OrgCtx, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || token === 'placeholder') return
  for (const chat of await ctx.scope.adminChats().catch(() => [])) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  }
}

/** After any change to an organisation's team, drop the cached reads so the next screen shows the truth. */
export const dropTeamCaches = (name: string = org) => { invalidate(`team:${name}`); invalidate(`members:${name}`); invalidate(`lookup:${name}`) }

// ---------------------------------------------------------------------------------------------------------------------
// Public lookups shared by the v1 API, the verification profile page and the badge.
export const LABEL_RE = /^[a-z0-9-]{1,32}$/

export interface TeamMember { label: string; fqn: string; status: 'active' | 'former'; role: string | null; since: string | null; registeredAt: number; revokedAt: number | null }

/** The team as the org publishes it on ENSv2 (public data only: no Telegram IDs or usernames). */
export function getTeam(ctx: OrgCtx): Promise<TeamMember[]> {
  return cached(`team:${ctx.name}`, 4000, async () => {
    const members = await listMembers(pub, ctx.d)
    return Promise.all(
      members.map(async (m) => {
        const fqn = memberName(m.label, ctx.d)
        const read = m.status === 'active' ? ctx.reader.readText : ctx.reader.readTextDirect
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
export function lookupMember(ctx: OrgCtx, label: string): Promise<Lookup> {
  if (!LABEL_RE.test(label)) return Promise.resolve({ kind: 'invalid' })
  return cached(`lookup:${ctx.name}:${label}`, 5000, async (): Promise<Lookup> => {
    const fqn = memberName(label, ctx.d)
    const state = await getMemberState(pub, label, ctx.d)
    const telegramId = await ctx.reader.readTextDirect(fqn, TELEGRAM_KEY) // works for revoked names too: unregister keeps the records
    if (!telegramId) return state.status === 'REGISTERED' ? { kind: 'unattested', fqn, role: (await readText(pub, fqn, 'org.role', ctx.d)), since: (await readText(pub, fqn, 'org.since', ctx.d)) } : { kind: 'unknown' }
    const result = await checkIdentity(ctx.reader, { telegramId }, await getDirectory(ctx))
    const role = result.status === 'verified' || result.status === 'former' ? result.member.role : null
    const since = result.status === 'verified' || result.status === 'former' ? result.member.since : null
    return { kind: 'checked', fqn, role, since, telegramId, result }
  })
}
