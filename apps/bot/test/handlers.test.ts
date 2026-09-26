import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { JsonStore } from '@kakunin/core/store'
import type { Reader } from '@kakunin/core'
import { extractSubject, handleCheck, handleStart, type Deps } from '../src/handlers'

const mkDeps = (over: Partial<Deps> = {}, reader?: Partial<Reader>) => {
  const store = new JsonStore(join(mkdtempSync(join(tmpdir(), 'kbot-')), 's.json'))
  const notify = vi.fn(async () => {})
  const deps: Deps = {
    store, org: 'acme.eth', notifyAdmins: notify, issue: async (l) => ({ fqn: `${l}.team.acme.eth` }),
    reader: {
      orgName: 'acme.eth', listMembers: async () => [], getState: async () => ({ status: 'AVAILABLE', expiry: 0, owner: '0x0000000000000000000000000000000000000000' }),
      readText: async () => null, readTextDirect: async () => null, attesterAddress: async () => null, ...reader,
    },
    ...over,
  }
  return { deps, store, notify }
}

describe('extractSubject', () => {
  it('forwarded message -> ORIGINAL sender numeric id + username', () => {
    expect(extractSubject({ forward_origin: { type: 'user', sender_user: { id: 42, username: 'Scam_Bob', first_name: 'Bob', last_name: 'T' } } })).toEqual({
      telegramId: '42', username: 'Scam_Bob', displayName: 'Bob T',
    })
  })
  it('hidden_user -> display name only, asks for @username', () => {
    expect(extractSubject({ forward_origin: { type: 'hidden_user', sender_user_name: 'Alice M' } })).toEqual({ displayName: 'Alice M', needsUsername: true })
  })
  it('bare @username / numeric id', () => {
    expect(extractSubject({ text: '@alice_kakunin' })).toEqual({ username: 'alice_kakunin' })
    expect(extractSubject({ text: '100000001' })).toEqual({ telegramId: '100000001' })
  })
  it('garbage -> null', () => expect(extractSubject({ text: 'hello there, how are you' })).toBeNull())
})

describe('handleStart', () => {
  it('no payload -> welcome', async () => expect(await handleStart(mkDeps().deps, { id: 1 }, '')).toMatch(/Kakunin/))
  it('valid invite -> attests numeric id, records username, burns the invite', async () => {
    const { deps, store } = mkDeps()
    const issue = vi.fn(async (l: string) => ({ fqn: `${l}.team.acme.eth` }))
    deps.issue = issue
    const inv = store.createInvite('alice')
    const out = await handleStart(deps, { id: 777, username: 'Alice_K', first_name: 'Alice' }, inv.token)
    expect(out).toMatch(/verified as alice\.team\.acme\.eth/)
    expect(issue).toHaveBeenCalledWith('alice', '777')
    expect(store.read().directory[0]).toMatchObject({ label: 'alice', telegramId: '777', username: 'alice_k' })
    expect(await handleStart(deps, { id: 778 }, inv.token)).toMatch(/invalid or was already used/)
  })
  it('failed on-chain issue keeps the invite usable', async () => {
    const { deps, store } = mkDeps({ issue: async () => { throw new Error('rpc down') } })
    const inv = store.createInvite('alice')
    expect(await handleStart(deps, { id: 1 }, inv.token)).toMatch(/rpc down/)
    expect(store.peekInvite(inv.token)).not.toBeNull()
  })
})

describe('handleCheck', () => {
  it('unknown sender -> ❓ + alert stored + org notified', async () => {
    const { deps, store, notify } = mkDeps()
    const out = await handleCheck(deps, { telegramId: '5', username: 'recruiter_x' })
    expect(out.text).toMatch(/^❓/)
    expect(store.read().alerts[0]).toMatchObject({ kind: 'unknown', org: 'acme.eth', detail: '@recruiter_x' })
    expect(notify).toHaveBeenCalledOnce()
  })
  it('hidden sender -> asks for @username, no alert', async () => {
    const { deps, store, notify } = mkDeps()
    const out = await handleCheck(deps, { displayName: 'Alice', needsUsername: true })
    expect(out.text).toMatch(/hides their account/)
    expect(store.read().alerts).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })
  it('lookalike of a directory member -> ⚠️', async () => {
    const { deps, store } = mkDeps()
    store.upsertMember({ label: 'alice', telegramId: '1', username: 'alice_acme' })
    expect((await handleCheck(deps, { telegramId: '9', username: 'alice_acmee' })).text).toMatch(/^⚠️/)
  })
  it('a notify failure never breaks the reply', async () => {
    const { deps } = mkDeps({ notifyAdmins: async () => { throw new Error('blocked') } })
    expect((await handleCheck(deps, { username: 'nobody_here' })).text).toMatch(/^❓/)
  })
})
