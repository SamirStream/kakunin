import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createRateLimiter } from '../src/ratelimit'
import { INVITE_MAX_AGE_MS, inviteMessage, verifyInviteAuth } from '../src/auth'

const hr = privateKeyToAccount(generatePrivateKey())
const attacker = privateKeyToAccount(generatePrivateKey())
const now = 1_790_000_000_000
const sign = (who: typeof hr, label: string, t: number) => who.signMessage({ message: inviteMessage('acme.eth', label, t) })
const base = { org: 'acme.eth', allowedSigners: [hr.address], nowMs: now }

describe('verifyInviteAuth', () => {
  it('accepts a fresh signature from the HR wallet', async () => {
    const r = await verifyInviteAuth({ ...base, label: 'alice', issuedAtMs: now, signature: await sign(hr, 'alice', now) })
    expect(r).toEqual({ ok: true, signer: hr.address })
  })
  it('rejects a signature from anyone else (the attack: invite for someone else\'s subname)', async () => {
    const r = await verifyInviteAuth({ ...base, label: 'alice', issuedAtMs: now, signature: await sign(attacker, 'alice', now) })
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/not the org/) })
  })
  it('a signature for one member cannot be replayed for another', async () => {
    const sig = await sign(hr, 'bob', now)
    expect((await verifyInviteAuth({ ...base, label: 'alice', issuedAtMs: now, signature: sig })).ok).toBe(false)
  })
  it('rejects stale and future-dated signatures', async () => {
    const old = now - INVITE_MAX_AGE_MS - 1
    expect((await verifyInviteAuth({ ...base, label: 'alice', issuedAtMs: old, signature: await sign(hr, 'alice', old) })).ok).toBe(false)
    const future = now + INVITE_MAX_AGE_MS + 1
    expect((await verifyInviteAuth({ ...base, label: 'alice', issuedAtMs: future, signature: await sign(hr, 'alice', future) })).ok).toBe(false)
  })
  it('rejects garbage without throwing', async () => {
    expect(await verifyInviteAuth({ ...base, label: 'alice', issuedAtMs: now, signature: '0x1234' })).toMatchObject({ ok: false })
  })
})

describe('createRateLimiter', () => {
  it('allows up to max per window, then blocks, then recovers', () => {
    let t = 0
    const rl = createRateLimiter(3, 1000, () => t)
    expect([rl.take('a'), rl.take('a'), rl.take('a'), rl.take('a')]).toEqual([true, true, true, false])
    expect(rl.take('b')).toBe(true) // keys are independent
    t = 1001
    expect(rl.take('a')).toBe(true)
  })
})

import { ACTION_MAX_AGE_MS, actionMessage, verifyAction } from '../src/auth'
import { generatePrivateKey as gen, privateKeyToAccount as toAcc } from 'viem/accounts'

describe('verifyAction', () => {
  const owner = toAcc(gen()), other = toAcc(gen())
  const sign = (a: typeof owner, org: string, action: 'revoke-member' | 'session', target: string, t: number) => a.signMessage({ message: actionMessage(org, action, target, t) })
  const now = 1_790_000_000_000
  it('accepts the owner for exactly the signed action and target', async () => {
    const t = now - 1000
    const signature = await sign(owner, 'acme.eth', 'revoke-member', 'bob', t)
    expect(await verifyAction({ org: 'acme.eth', action: 'revoke-member', target: 'bob', issuedAtMs: t, signature, allowedSigners: [owner.address], nowMs: now })).toEqual({ ok: true, signer: owner.address })
    for (const swap of [{ target: 'alice' }, { org: 'evil.eth' }, { action: 'session' as const }]) {
      const r = await verifyAction({ org: 'acme.eth', action: 'revoke-member', target: 'bob', issuedAtMs: t, signature, allowedSigners: [owner.address], nowMs: now, ...swap })
      expect(r.ok).toBe(false)
    }
  })
  it('rejects strangers, stale signatures and garbage', async () => {
    const t = now - 1000
    const strange = await sign(other, 'acme.eth', 'revoke-member', 'bob', t)
    expect((await verifyAction({ org: 'acme.eth', action: 'revoke-member', target: 'bob', issuedAtMs: t, signature: strange, allowedSigners: [owner.address], nowMs: now }))).toMatchObject({ ok: false, reason: expect.stringMatching(/does not administer/) })
    const old = now - ACTION_MAX_AGE_MS - 1
    const stale = await sign(owner, 'acme.eth', 'revoke-member', 'bob', old)
    expect((await verifyAction({ org: 'acme.eth', action: 'revoke-member', target: 'bob', issuedAtMs: old, signature: stale, allowedSigners: [owner.address], nowMs: now })).ok).toBe(false)
    expect((await verifyAction({ org: 'acme.eth', action: 'revoke-member', target: 'bob', issuedAtMs: t, signature: '0x1234', allowedSigners: [owner.address], nowMs: now }))).toMatchObject({ ok: false, reason: 'invalid signature' })
  })
  it('a session signature lasts an hour, an action only five minutes', async () => {
    const t = now - 30 * 60 * 1000
    const session = await sign(owner, 'acme.eth', 'session', '', t)
    expect((await verifyAction({ org: 'acme.eth', action: 'session', issuedAtMs: t, signature: session, allowedSigners: [owner.address], nowMs: now })).ok).toBe(true)
    const act = await sign(owner, 'acme.eth', 'revoke-member', 'bob', t)
    expect((await verifyAction({ org: 'acme.eth', action: 'revoke-member', target: 'bob', issuedAtMs: t, signature: act, allowedSigners: [owner.address], nowMs: now })).ok).toBe(false)
  })
})
