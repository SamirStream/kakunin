import { describe, expect, it } from 'vitest'
import { verdictFromResponse } from '../src/screener'

// Responses RECORDED from the live Intercepta API on 2026-09-26 (fixtures for the mapping only; the agent calls the real API at runtime).
const RISKY = { toxicScore: 100, traits: [
  { risk: 100, name: 'known_scammer', description: 'The address has a confirmed history of malicious activity, including scams, phishing, or other harmful behavior.' },
  { risk: 100, name: 'sanction_address', description: 'The address is officially listed as sanctioned and poses significant legal and financial risks.' },
  { risk: 100, name: 'blacklist', description: 'The address appears on external or internal blacklist sources due to prior involvement in high-risk or malicious activity.' },
] }
const CLEAN = { toxicScore: 0, traits: [] }
const MINOR = { toxicScore: 0.04, traits: [{ risk: 0.04, name: 'non_kyc_transfers', txsCount: 157, description: 'Engaging with crypto exchanges that lack KYC verification.' }] }
const ATTACK = { toxicScore: 85, traits: [{ risk: 85, name: 'attack_money_target', description: 'The address has received funds tied to exploits, wallet drainers, or other forms of attack-related activity.' }] }

describe('verdictFromResponse (Intercepta quick-scan)', () => {
  it('sanctioned address -> critical with the reasons shown', () => {
    const v = verdictFromResponse('0xabc', 200, RISKY)
    expect(v.risk).toBe('critical')
    expect(v.reasons.join(' ')).toMatch(/sanction_address/)
    expect(v.reasons.join(' ')).toMatch(/known_scammer/)
  })
  it('clean address -> low', () => expect(verdictFromResponse('0xabc', 200, CLEAN)).toMatchObject({ risk: 'low' }))
  it('negligible trait -> still low and not listed as a reason', () => {
    const v = verdictFromResponse('0xabc', 200, MINOR)
    expect(v.risk).toBe('low')
    expect(v.reasons.join(' ')).not.toMatch(/non_kyc/)
  })
  it('high score without a hard flag -> critical by score', () => expect(verdictFromResponse('0xabc', 200, ATTACK).risk).toBe('critical'))
  it('score bands: 20 medium, 50 high', () => {
    expect(verdictFromResponse('0x', 200, { toxicScore: 25, traits: [] }).risk).toBe('medium')
    expect(verdictFromResponse('0x', 200, { toxicScore: 60, traits: [] }).risk).toBe('high')
  })
  it('404 (contract / unseen address) -> unknown, so a human decides', () => {
    expect(verdictFromResponse('0xabc', 404, { errors: [{ message: "An Externally Owned Account with this address doesn't exist." }] }).risk).toBe('unknown')
  })
  it('unrecognised body -> unknown; server errors THROW (fail closed upstream)', () => {
    expect(verdictFromResponse('0xabc', 200, { hello: 1 }).risk).toBe('unknown')
    expect(() => verdictFromResponse('0xabc', 500, {})).toThrow(/HTTP 500/)
    expect(() => verdictFromResponse('0xabc', 401, {})).toThrow(/HTTP 401/)
  })
})
