import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonStore, UpstashStore, createStore, usingUpstash, type Store } from '../src/store'
import { formatAlert, formatResult } from '../src/messages'

/** Minimal in-memory Redis speaking the Upstash REST protocol (POST a JSON command array), for the commands we use. */
function fakeUpstash(): { fetch: typeof fetch; calls: string[][] } {
  const kv = new Map<string, string>(), hashes = new Map<string, Map<string, string>>(), lists = new Map<string, string[]>(), sets = new Map<string, Set<string>>()
  const calls: string[][] = []
  const run = (c: (string | number)[]): unknown => {
    const [op, key, ...rest] = c.map(String)
    switch (op) {
      case 'SET': kv.set(key, rest[0]); return 'OK'
      case 'GET': return kv.get(key) ?? null
      case 'GETDEL': { const v = kv.get(key) ?? null; kv.delete(key); return v }
      case 'HSET': (hashes.get(key) ?? hashes.set(key, new Map()).get(key)!).set(rest[0], rest[1]); return 1
      case 'HGET': return hashes.get(key)?.get(rest[0]) ?? null
      case 'HDEL': return hashes.get(key)?.delete(rest[0]) ? 1 : 0
      case 'HGETALL': return [...(hashes.get(key) ?? new Map()).entries()].flat()
      case 'LPUSH': (lists.get(key) ?? lists.set(key, []).get(key)!).unshift(rest[0]); return 1
      case 'LTRIM': lists.set(key, (lists.get(key) ?? []).slice(Number(rest[0]), Number(rest[1]) + 1)); return 'OK'
      case 'LRANGE': return (lists.get(key) ?? []).slice(Number(rest[0]), Number(rest[1]) + 1)
      case 'SADD': (sets.get(key) ?? sets.set(key, new Set()).get(key)!).add(rest[0]); return 1
      case 'SMEMBERS': return [...(sets.get(key) ?? [])]
      default: throw new Error(`fake redis: unsupported ${op}`)
    }
  }
  const f = (async (_url: unknown, init: RequestInit) => {
    const cmd = JSON.parse(String(init.body)) as (string | number)[]
    calls.push(cmd.map(String))
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer T')
    return new Response(JSON.stringify({ result: run(cmd) }), { status: 200 })
  }) as unknown as typeof fetch
  return { fetch: f, calls }
}

const backends: [string, () => Store][] = [
  ['JsonStore', () => new JsonStore(join(mkdtempSync(join(tmpdir(), 'kakunin-')), 'store.json'))],
  ['UpstashStore (fake redis)', () => new UpstashStore('https://redis.example', 'T', fakeUpstash().fetch)],
]

describe.each(backends)('Store contract: %s', (_name, make) => {
  it('invites are single-use', async () => {
    const s = make()
    const inv = await s.createInvite('alice')
    expect((await s.peekInvite(inv.token))?.label).toBe('alice')
    expect((await s.consumeInvite(inv.token))?.label).toBe('alice')
    expect(await s.consumeInvite(inv.token)).toBeNull()
    expect(await s.peekInvite(inv.token)).toBeNull()
    expect(await s.consumeInvite('nope')).toBeNull()
  })
  it('upsert keeps one entry per numeric ID and merges fields', async () => {
    const s = make()
    await s.upsertMember({ label: 'alice', telegramId: '1', username: 'a' })
    await s.upsertMember({ label: 'alice', telegramId: '1', displayName: 'Alice M' })
    await s.upsertMember({ label: 'bob', telegramId: '2' })
    const dir = await s.directory()
    expect(dir).toHaveLength(2)
    expect(dir.find((e) => e.telegramId === '1')).toMatchObject({ username: 'a', displayName: 'Alice M' })
  })
  it('refreshIdentity updates a known ID username, ignores unknown IDs', async () => {
    const s = make()
    await s.upsertMember({ label: 'alice', telegramId: '1', username: 'old_name' })
    expect(await s.refreshIdentity('1', 'New_Name', 'Alice M')).toBe(true)
    expect((await s.directory())[0]).toMatchObject({ username: 'new_name', displayName: 'Alice M' })
    expect(await s.refreshIdentity('1', 'new_name', 'Alice M')).toBe(false)
    expect(await s.refreshIdentity('999', 'x', 'y')).toBe(false)
  })
  it('removeMember drops the entry', async () => {
    const s = make()
    await s.upsertMember({ label: 'alice', telegramId: '1' })
    await s.removeMember('alice')
    expect(await s.directory()).toEqual([])
  })
  it('alerts are newest-first and capped', async () => {
    const s = make()
    await s.addAlert({ org: 'o.eth', kind: 'unknown', subject: { username: 'a' }, detail: '1' })
    await s.addAlert({ org: 'o.eth', kind: 'lookalike', subject: { username: 'b' }, detail: '2' })
    expect((await s.alerts()).map((a) => a.detail)).toEqual(['2', '1'])
    expect(await s.alerts(1)).toHaveLength(1)
  })
  it('admin chats are a set', async () => {
    const s = make()
    await s.addOrgAdminChat(42)
    await s.addOrgAdminChat(42)
    await s.addOrgAdminChat(7)
    expect((await s.adminChats()).sort((a, b) => a - b)).toEqual([7, 42])
  })
})

describe('createStore', () => {
  it('uses Upstash when its env vars are set (Vercel Marketplace or Upstash names), JSON otherwise', () => {
    expect(usingUpstash({})).toBe(false)
    expect(usingUpstash({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' })).toBe(true)
    expect(usingUpstash({ UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' })).toBe(true)
    expect(createStore('/tmp/x.json', {})).toBeInstanceOf(JsonStore)
    expect(createStore('/tmp/x.json', { KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' })).toBeInstanceOf(UpstashStore)
  })
  it('Upstash errors surface (never silently lose data)', async () => {
    const bad = (async () => new Response(JSON.stringify({ error: 'WRONGPASS' }), { status: 401 })) as unknown as typeof fetch
    await expect(new UpstashStore('https://x', 'T', bad).addAlert({ org: 'o', kind: 'unknown', subject: {}, detail: 'd' })).rejects.toThrow(/upstash LPUSH failed/)
  })
})

describe('messages', () => {
  it('renders the four statuses with their emoji', () => {
    const member = { label: 'a', fqn: 'a.team.o.eth', role: 'Eng', since: '2024-01-01', telegramId: '1' }
    expect(formatResult({ status: 'verified', org: 'o.eth', member, attestation: { valid: true, signer: '0x0000000000000000000000000000000000000001', issuedAt: 1790000000, version: 1 } })).toMatch(/^✅/)
    expect(formatResult({ status: 'former', org: 'o.eth', member, revokedAt: 1790000000 })).toMatch(/^🕓.*\n.*revoked on 2026-/s)
    expect(formatResult({ status: 'lookalike', org: 'o.eth', lookalikeOf: { label: 'a', fqn: 'a.team.o.eth', handle: 'alice' }, distance: 1 })).toMatch(/^⚠️/)
    expect(formatResult({ status: 'unknown', org: 'o.eth' })).toMatch(/^❓/)
  })
  it('alert wording', () => {
    expect(formatAlert('o.eth', 'lookalike', '@x')).toMatch(/impersonation/)
  })
})
