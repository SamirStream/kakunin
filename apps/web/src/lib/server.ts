// Server-only helpers (API routes). Never import from a client component.
import { resolve } from 'node:path'
import { DEPLOYMENT, chainReader, publicClient, type DirectoryEntry } from '@kakunin/core'
import { JsonStore } from '@kakunin/core/store'
// Bundled at build time (no runtime fs access), so it also works on serverless hosts.
import demoDirectory from '../../../../demo/directory.json'

// Local: Next runs with cwd = apps/web and the repo root holds data/ (shared with the bot).
// Serverless (Vercel): the deployment is read-only, so the store lives in /tmp (per-instance, ephemeral: alerts only).
const STORE_PATH = process.env.KAKUNIN_STORE_PATH ?? (process.env.VERCEL ? '/tmp/kakunin-store.json' : resolve(process.cwd(), '../../data/store.json'))
export const store = new JsonStore(STORE_PATH)
export const pub = publicClient(process.env.SEPOLIA_RPC_URL)
export const reader = chainReader(pub)
export const org = DEPLOYMENT.orgName
export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME || 'KakuninBot'

/** Bot-collected directory, plus the committed demo directory as a fallback so /demo works out of the box. */
export function getDirectory(): DirectoryEntry[] {
  const live = store.read().directory
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
