import { describe, expect, it } from 'vitest'
import { openSecret, sealSecret } from '../src/crypto'

const S = 'a-long-enough-server-secret'
describe('sealSecret', () => {
  it('round-trips and never repeats a ciphertext', () => {
    const a = sealSecret('0xabc', S), b = sealSecret('0xabc', S)
    expect(a).not.toBe(b)
    expect(openSecret(a, S)).toBe('0xabc')
  })
  it('rejects a wrong secret, tampering and short secrets', () => {
    const a = sealSecret('0xabc', S)
    expect(() => openSecret(a, 'another-long-enough-secret')).toThrow()
    const raw = Buffer.from(a, 'base64url'); raw[raw.length - 1] ^= 1
    expect(() => openSecret(raw.toString('base64url'), S)).toThrow()
    expect(() => openSecret('AAAA', S)).toThrow()
    expect(() => sealSecret('x', 'short')).toThrow(/16 characters/)
  })
})
