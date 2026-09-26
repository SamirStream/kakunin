import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonStore, UpstashStore, confirmedImpersonators, createStore, usingUpstash, type Store } from '../src/store'
import { formatAlert, formatResult } from '../src/messages'

/** Minimal in-memory Redis speaking the Upstash REST protocol (POST a JSON command array), for the commands we use. */
function fakeUpstash(): { fetch: typeof fetch; calls: string[][] } {
  const kv = new Map<string, string>(), hashes = new Map<string, Map<string, string>>(), lists = new Map<string, string[]>(), sets = new Map<string, Set<string>>()
  const calls: string[][] = []
  const run = (c: (string | number)[]): unknown => {
    const [op, key, ...rest] = c.map(String)
    switch (op) {
      case 'SET': if (rest.includes('NX') && kv.has(key)) return null; kv.set(key, rest[0]); return 'OK'
      case 'DEL': return kv.delete(key) || lists.delete(key) || sets.delete(key) ? 1 : 0
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
    const o = s.forOrg('o.eth')
    expect((await o.alerts()).map((a) => a.detail)).toEqual(['2', '1'])
    expect(await o.alerts(1)).toHaveLength(1)
    expect(await s.alerts()).toEqual([]) // the demo org's feed is separate
    await o.clearAlerts()
    expect(await o.alerts()).toEqual([])
  })
  it('organisations are isolated: directory, alerts, admins and invites', async () => {
    const s = make()
    const a = s.forOrg('acme.eth'), b = s.forOrg('beta.eth')
    await a.upsertMember({ label: 'zoe', telegramId: '5', username: 'zoe' })
    await b.upsertMember({ label: 'yan', telegramId: '6' })
    await s.upsertMember({ label: 'demo', telegramId: '7' })
    expect((await a.directory()).map((e) => e.label)).toEqual(['zoe'])
    expect((await b.directory()).map((e) => e.label)).toEqual(['yan'])
    expect((await s.directory()).map((e) => e.label)).toEqual(['demo'])
    await a.addOrgAdminChat(1)
    await b.addOrgAdminChat(2)
    expect(await a.adminChats()).toEqual([1])
    expect(await b.adminChats()).toEqual([2])
    expect(await s.adminChats()).toEqual([])
    expect(await s.adminOrgs(1)).toEqual(['acme.eth'])
    const inv = await a.createInvite('zoe')
    expect((await s.peekInvite(inv.token))).toMatchObject({ label: 'zoe', org: 'acme.eth', kind: 'member' })
    const adm = await a.createInvite('-', 'admin')
    expect((await s.consumeInvite(adm.token))?.kind).toBe('admin')
  })
  it('the same person can belong to several orgs; identity refresh reaches all of them', async () => {
    const s = make()
    await s.forOrg('acme.eth').upsertMember({ label: 'zoe', telegramId: '5', username: 'old' })
    await s.forOrg('beta.eth').upsertMember({ label: 'zed', telegramId: '5', username: 'old' })
    expect((await s.memberOrgs('5')).sort()).toEqual(['acme.eth', 'beta.eth'])
    expect(await s.refreshIdentity('5', 'New', 'Zoe')).toBe(true)
    expect((await s.forOrg('acme.eth').directory())[0].username).toBe('new')
    expect((await s.forOrg('beta.eth').directory())[0].username).toBe('new')
    expect(await s.memberOrgs('404')).toEqual([])
  })
  it('reports: merged per account, per-organisation, decided by an admin', async () => {
    const s = make()
    const a = s.forOrg('acme.eth'), b = s.forOrg('beta.eth')
    const r1 = await a.addReport({ subject: { username: '@Fake_Alice', telegramId: '9' }, note: '  DM me for a job  ' })
    expect(r1).toMatchObject({ status: 'pending', count: 1, subject: { username: 'fake_alice', telegramId: '9' }, note: 'DM me for a job' })
    const r2 = await a.addReport({ subject: { telegramId: '9' } })
    expect(r2.id).toBe(r1.id)
    expect(r2.count).toBe(2)
    expect((await a.reports())).toHaveLength(1)
    expect(await b.reports()).toEqual([])
    expect(await s.reports()).toEqual([]) // the sample org is separate
    expect((await a.decideReport(r1.id, 'confirmed'))?.status).toBe('confirmed')
    expect(await b.decideReport(r1.id, 'confirmed')).toBeNull() // cannot decide another org's report
    expect(confirmedImpersonators(await a.reports())).toMatchObject([{ telegramId: '9', username: 'fake_alice', note: 'DM me for a job' }])
    const comp = await a.addReport({ subject: { telegramId: '9' }, kind: 'compromised' })
    expect(comp.id).not.toBe(r1.id) // same account, different kind: a separate report
    await a.decideReport(comp.id, 'confirmed')
    expect(confirmedImpersonators(await a.reports())).toHaveLength(1) // a compromised-account report never makes someone an impersonator
    await a.decideReport(r1.id, 'dismissed')
    expect(confirmedImpersonators(await a.reports())).toEqual([])
    const again = await a.addReport({ subject: { telegramId: '9' } }) // a dismissed report does not swallow new ones
    expect(again.id).not.toBe(r1.id)
    expect(again.status).toBe('pending')
  })
  it('org records, name claims and provisioning jobs', async () => {
    const s = make()
    expect(await s.getOrg('acme.eth')).toBeNull()
    const rec = { name: 'acme.eth', deployment: {} as never, owner: '0x0000000000000000000000000000000000000001' as const, operator: '0x0000000000000000000000000000000000000002' as const, operatorKey: 'sealed', createdAt: 1, txs: [] }
    await s.putOrg(rec)
    await s.putOrg({ ...rec, createdAt: 2 })
    expect((await s.listOrgs()).map((o) => o.createdAt)).toEqual([2])
    expect((await s.getOrg('acme.eth'))?.operatorKey).toBe('sealed')
    expect(await s.claimName('beta.eth', 'job1')).toBe(true)
    expect(await s.claimName('beta.eth', 'job1')).toBe(true) // same run may re-claim
    expect(await s.claimName('beta.eth', 'job2')).toBe(false)
    await s.releaseName('beta.eth')
    expect(await s.claimName('beta.eth', 'job2')).toBe(true)
    const job = { id: 'j', name: 'beta.eth', owner: rec.owner, operator: rec.operator, operatorKey: 'k', status: 'running' as const, step: 'fund', data: {}, txs: [], createdAt: 1, updatedAt: 1 }
    await s.putJob(job)
    await s.putJob({ ...job, step: 'commit' })
    expect((await s.getJob('j'))?.step).toBe('commit')
    expect(await s.getJob('nope')).toBeNull()
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
    expect(formatResult({ status: 'verified', org: 'o.eth', member, attestation: { valid: true, signer: '0x0000000000000000000000000000000000000001', issuedAt: 1790000000, version: 1 }, proof: { chain: 'sepolia', name: 'a.team.o.eth', owner: '0x0000000000000000000000000000000000000002', attesterName: 'o.eth', attester: '0x0000000000000000000000000000000000000001', recordKey: 'attestations[org.telegram.id][o.eth]', envelope: 'AAA', teamRegistry: '0x0000000000000000000000000000000000000003', teamResolver: '0x0000000000000000000000000000000000000004' } })).toMatch(/^✅/)
    expect(formatResult({ status: 'former', org: 'o.eth', member, revokedAt: 1790000000 })).toMatch(/^🕓.*\n.*revoked on 2026-/s)
    expect(formatResult({ status: 'lookalike', org: 'o.eth', lookalikeOf: { label: 'a', fqn: 'a.team.o.eth', handle: 'alice' }, distance: 1 })).toMatch(/^⚠️/)
    expect(formatResult({ status: 'unknown', org: 'o.eth' })).toMatch(/^❓/)
  })
  it('alert wording', () => {
    expect(formatAlert('o.eth', 'lookalike', '@x')).toMatch(/impersonation/)
  })
})
