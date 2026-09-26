// Server-only helpers (API routes). Never import from a client component.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEPLOYMENT, chainReader, publicClient, type DirectoryEntry } from '@kakunin/core'
import { JsonStore } from '@kakunin/core/store'

// Next runs with cwd = apps/web; the repo root holds data/, demo/ and .env.
const ROOT = resolve(process.cwd(), '../..')
export const store = new JsonStore(resolve(ROOT, 'data/store.json'))
export const pub = publicClient(process.env.SEPOLIA_RPC_URL)
export const reader = chainReader(pub)
export const org = DEPLOYMENT.orgName
export const botUsername = () => process.env.TELEGRAM_BOT_USERNAME || 'KakuninBot'

/** Bot-collected directory, plus the committed demo directory as a fallback so /demo works out of the box. */
export function getDirectory(): DirectoryEntry[] {
  const live = store.read().directory
  const demoPath = resolve(ROOT, 'demo/directory.json')
  const demo: DirectoryEntry[] = existsSync(demoPath) ? JSON.parse(readFileSync(demoPath, 'utf8')) : []
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
