import { describe, expect, it } from 'vitest'
import { signInitData, validateInitData } from '../src/telegram'

const TOKEN = '123456:TEST-token-not-real'
const NOW = 1_790_000_000_000
const user = JSON.stringify({ id: 1461646330, first_name: 'Samir', username: 'someone' })
const fresh = (over: Record<string, string> = {}) =>
  signInitData({ query_id: 'AAH', user, auth_date: String(NOW / 1000 - 60), ...over }, TOKEN)

describe('validateInitData', () => {
  it('accepts data signed with the bot token and returns the authenticated user', () => {
    const r = validateInitData(fresh(), TOKEN, { nowMs: NOW })
    expect(r).toMatchObject({ ok: true, user: { id: 1461646330, username: 'someone' } })
  })
  it('returns the start_param (deep-link payload) when present', () => {
    expect(validateInitData(fresh({ start_param: 'inv_abc' }), TOKEN, { nowMs: NOW })).toMatchObject({ ok: true, startParam: 'inv_abc' })
  })
  it('rejects data signed with another bot token', () => {
    expect(validateInitData(fresh(), '999:other-token', { nowMs: NOW })).toEqual({ ok: false, reason: 'bad-signature' })
  })
  it('rejects a tampered user id (the attack: claim to be someone else)', () => {
    const forged = fresh().replace(encodeURIComponent('"id":1461646330'), encodeURIComponent('"id":100000001'))
    expect(forged).not.toBe(fresh())
    expect(validateInitData(forged, TOKEN, { nowMs: NOW })).toEqual({ ok: false, reason: 'bad-signature' })
  })
  it('rejects a swapped hash and a missing hash', () => {
    const p = new URLSearchParams(fresh())
    p.set('hash', '0'.repeat(64))
    expect(validateInitData(p.toString(), TOKEN, { nowMs: NOW })).toEqual({ ok: false, reason: 'bad-signature' })
    p.delete('hash')
    expect(validateInitData(p.toString(), TOKEN, { nowMs: NOW })).toEqual({ ok: false, reason: 'no-hash' })
  })
  it('rejects expired and future-dated data (replay window)', () => {
    expect(validateInitData(fresh({ auth_date: String(NOW / 1000 - 7200) }), TOKEN, { nowMs: NOW })).toEqual({ ok: false, reason: 'expired' })
    expect(validateInitData(fresh({ auth_date: String(NOW / 1000 + 3600) }), TOKEN, { nowMs: NOW })).toEqual({ ok: false, reason: 'expired' })
  })
  it('rejects empty input and unparsable / invalid users', () => {
    expect(validateInitData('', TOKEN)).toEqual({ ok: false, reason: 'missing' })
    expect(validateInitData(undefined, TOKEN)).toEqual({ ok: false, reason: 'missing' })
    expect(validateInitData(fresh({ user: 'not json' }), TOKEN, { nowMs: NOW })).toEqual({ ok: false, reason: 'bad-user' })
    expect(validateInitData(fresh({ user: JSON.stringify({ id: -5 }) }), TOKEN, { nowMs: NOW })).toEqual({ ok: false, reason: 'bad-user' })
    expect(validateInitData(signInitData({ auth_date: String(NOW / 1000) }, TOKEN), TOKEN, { nowMs: NOW })).toEqual({ ok: false, reason: 'no-user' })
  })
})
