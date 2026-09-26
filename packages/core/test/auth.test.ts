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
