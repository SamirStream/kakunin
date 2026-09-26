import { describe, expect, it } from 'vitest'
import { agentAllowed, demoSignerAllowed, tokenMatches } from '../src/access'

const base = { enabled: true, local: false, proxied: true, expectedToken: 's3cret-token' }

describe('tokenMatches', () => {
  it('matches only the exact token', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true)
    expect(tokenMatches('abc', 'abd')).toBe(false)
    expect(tokenMatches('abc', 'abcd')).toBe(false)
  })
  it('never matches when either side is missing (no default token)', () => {
    expect(tokenMatches(undefined, undefined)).toBe(false)
    expect(tokenMatches('', '')).toBe(false)
    expect(tokenMatches('abc', null)).toBe(false)
    expect(tokenMatches(undefined, 'abc')).toBe(false)
  })
})

describe('demoSignerAllowed', () => {
  it('is OFF unless explicitly enabled, even with the right token', () => {
    expect(demoSignerAllowed({ ...base, enabled: false, providedToken: 's3cret-token' })).toBe(false)
    expect(demoSignerAllowed({ ...base, enabled: false, local: true, proxied: false })).toBe(false)
  })
  it('allows plain localhost without a token', () => {
    expect(demoSignerAllowed({ ...base, local: true, proxied: false })).toBe(true)
  })
  it('a proxied request claiming to be localhost still needs the token', () => {
    expect(demoSignerAllowed({ ...base, local: true, proxied: true })).toBe(false)
    expect(demoSignerAllowed({ ...base, local: true, proxied: true, providedToken: 's3cret-token' })).toBe(true)
  })
  it('remote callers need the admin token', () => {
    expect(demoSignerAllowed({ ...base })).toBe(false)
    expect(demoSignerAllowed({ ...base, providedToken: 'wrong' })).toBe(false)
    expect(demoSignerAllowed({ ...base, providedToken: 's3cret-token' })).toBe(true)
  })
  it('remote callers are refused when no admin token is configured', () => {
    expect(demoSignerAllowed({ ...base, expectedToken: undefined, providedToken: 'anything' })).toBe(false)
  })
})

describe('agentAllowed', () => {
  it('public flag opens it to everyone but still needs the signer opt-in', () => {
    expect(agentAllowed({ ...base, publicFlag: true })).toBe(true)
    expect(agentAllowed({ ...base, enabled: false, publicFlag: true })).toBe(false)
  })
  it('without the public flag it behaves like the demo actions', () => {
    expect(agentAllowed({ ...base, publicFlag: false })).toBe(false)
    expect(agentAllowed({ ...base, publicFlag: false, providedToken: 's3cret-token' })).toBe(true)
  })
})
