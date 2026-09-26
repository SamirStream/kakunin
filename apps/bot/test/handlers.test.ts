import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { JsonStore } from '@kakunin/core/store'
import { DEPLOYMENT, type Reader } from '@kakunin/core'
import { extractSubject, handleCheck, handleStart, type Deps, type OrgHandle } from '../src/handlers'

const emptyReader = (orgName: string, over: Partial<Reader> = {}): Reader => ({
  orgName, deployment: DEPLOYMENT, listMembers: async () => [],
  getState: async () => ({ status: 'AVAILABLE', expiry: 0, owner: '0x0000000000000000000000000000000000000000' }),
  readText: async () => null, readTextDirect: async () => null, attesterAddress: async () => null, ...over,
})

/** Two organisations, acme.eth and beta.eth, sharing one store (each with its own scope). */
const mkDeps = (over: Partial<Deps> = {}) => {
  const store = new JsonStore(join(mkdtempSync(join(tmpdir(), 'kbot-')), 's.json'))
  const notify = vi.fn(async (_chats: number[], _text: string) => {})
  const issue = vi.fn(async (l: string) => ({ fqn: `${l}.team.acme.eth` }))
  const handles = new Map<string, OrgHandle>()
  for (const name of ['acme.eth', 'beta.eth']) handles.set(name, { name, reader: emptyReader(name), scope: store.forOrg(name), issue: name === 'acme.eth' ? issue : async (l) => ({ fqn: `${l}.team.beta.eth` }) })
  const deps: Deps = { store, notify, org: async (n) => handles.get(n) ?? null, orgs: async () => [...handles.keys()], ...over }
  return { deps, store, notify, issue, handles }
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
  it('member invite -> attests numeric id in ITS organisation, records username, burns the invite', async () => {
    const { deps, store, issue } = mkDeps()
    const inv = await store.forOrg('acme.eth').createInvite('alice')
    const out = await handleStart(deps, { id: 777, username: 'Alice_K', first_name: 'Alice' }, inv.token)
    expect(out).toMatch(/verified as alice\.team\.acme\.eth/)
    expect(issue).toHaveBeenCalledWith('alice', '777')
    expect((await store.forOrg('acme.eth').directory())[0]).toMatchObject({ label: 'alice', telegramId: '777', username: 'alice_k' })
    expect(await store.forOrg('beta.eth').directory()).toEqual([]) // never leaks into another organisation
    expect(await handleStart(deps, { id: 778 }, inv.token)).toMatch(/invalid or was already used/)
  })
  it('an invite for an organisation Kakunin does not know is refused', async () => {
    const { deps, store } = mkDeps()
    const inv = await store.forOrg('ghost.eth').createInvite('x')
    expect(await handleStart(deps, { id: 1 }, inv.token)).toMatch(/invalid or was already used/)
  })
  it('admin invite -> the account becomes an admin of that organisation only', async () => {
    const { deps, store } = mkDeps()
    const inv = await store.forOrg('beta.eth').createInvite('-', 'admin')
    expect(await handleStart(deps, { id: 4242 }, inv.token)).toMatch(/administer beta\.eth/)
    expect(await store.adminOrgs(4242)).toEqual(['beta.eth'])
    expect(await store.forOrg('acme.eth').adminChats()).toEqual([])
    expect(await store.peekInvite(inv.token)).toBeNull()
  })
  it('failed on-chain issue keeps the invite usable', async () => {
    const { deps, store, handles } = mkDeps()
    handles.get('acme.eth')!.issue = async () => { throw new Error('rpc down') }
    const inv = await store.forOrg('acme.eth').createInvite('alice')
    expect(await handleStart(deps, { id: 1 }, inv.token)).toMatch(/rpc down/)
    expect(await store.peekInvite(inv.token)).not.toBeNull()
  })
})

describe('handleCheck', () => {
  it('a stranger unrelated to every project -> ❓ and nobody is spammed with alerts', async () => {
    const { deps, store, notify } = mkDeps()
    const out = await handleCheck(deps, { telegramId: '5', username: 'recruiter_x' })
    expect(out.text).toMatch(/^❓ Unknown to 2 projects/)
    expect(await store.forOrg('acme.eth').alerts()).toHaveLength(0)
    expect(await store.forOrg('beta.eth').alerts()).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })
  it('naming the organisation answers about it and alerts it', async () => {
    const { deps, store, notify } = mkDeps()
    await store.forOrg('acme.eth').addOrgAdminChat(9)
    const out = await handleCheck(deps, { telegramId: '5', username: 'recruiter_x' }, 'acme.eth')
    expect(out.text).toMatch(/^❓ Unknown to acme\.eth/)
    expect((await store.forOrg('acme.eth').alerts())[0]).toMatchObject({ kind: 'unknown', org: 'acme.eth', detail: '@recruiter_x' })
    expect(await store.forOrg('beta.eth').alerts()).toHaveLength(0)
    expect(notify).toHaveBeenCalledWith([9], expect.stringContaining('acme.eth'))
  })
  it('an unknown organisation name is reported, not silently ignored', async () => {
    expect((await handleCheck(mkDeps().deps, { username: 'someone_x' }, 'nope.eth')).text).toMatch(/does not know "nope\.eth"/)
  })
  it('hidden sender -> asks for @username, no alert', async () => {
    const { deps, store, notify } = mkDeps()
    const out = await handleCheck(deps, { displayName: 'Alice', needsUsername: true })
    expect(out.text).toMatch(/hides their account/)
    expect(await store.forOrg('acme.eth').alerts()).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })
  it('lookalike of a member of ONE organisation -> ⚠️, only that organisation is alerted', async () => {
    const { deps, store, notify } = mkDeps()
    await store.forOrg('acme.eth').upsertMember({ label: 'alice', telegramId: '1', username: 'alice_acme' })
    await store.forOrg('acme.eth').addOrgAdminChat(9)
    await store.forOrg('beta.eth').addOrgAdminChat(10)
    const out = await handleCheck(deps, { telegramId: '9', username: 'alice_acmee' })
    expect(out.text).toMatch(/^⚠️/)
    expect(await store.forOrg('acme.eth').alerts()).toHaveLength(1)
    expect(await store.forOrg('beta.eth').alerts()).toHaveLength(0)
    expect(notify).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledWith([9], expect.any(String))
  })
  it('a notify failure never breaks the reply', async () => {
    const { deps } = mkDeps({ notify: async () => { throw new Error('blocked') } })
    expect((await handleCheck(deps, { username: 'nobody_here' }, 'acme.eth')).text).toMatch(/^❓/)
  })
})
