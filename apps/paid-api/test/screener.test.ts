import { describe, expect, it } from 'vitest'
import { tokenScanChain, tokenVerdictFromResponse, verdictFromResponse } from '../src/screener'

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

// Recorded live on 2026-09-27 (mainnet USDC, chainId 1). The risky shapes below follow the documented enums (not seen live).
const USDC_OK = { apiVersion: '2.3.1', token: { chainId: '1', address: '0xa0b8…eb48', symbol: 'USDC' }, trust: 'whitelist', detectors: [], saleTax: { currentValue: 0, minValue: 0, maxValue: 0 }, buyTax: { currentValue: 0, minValue: 0, maxValue: 0 }, riskScore: 0, riskLevel: 'neutral', category: 'info', action: 'info' }
const HONEYPOT = { riskScore: 95, riskLevel: 'high', category: 'malicious', trust: 'neutral', action: 'block', detectors: [{ code: 'honeypot', description: 'Holders cannot sell this token.' }] }
const SUSPICIOUS = { riskScore: 45, riskLevel: 'medium', category: 'suspicious', trust: 'neutral', action: 'warn', detectors: [{ code: 'owner_can_mint', description: 'The owner can mint new supply.' }] }

describe('tokenVerdictFromResponse (Intercepta Scan Token)', () => {
  it('real USDC (recorded live) -> low', () => expect(tokenVerdictFromResponse('0xusdc', 200, USDC_OK)).toMatchObject({ risk: 'low' }))
  it('blocked / malicious token -> critical, with the detector shown', () => {
    const v = tokenVerdictFromResponse('0xbad', 200, HONEYPOT)
    expect(v.risk).toBe('critical')
    expect(v.reasons.join(' ')).toMatch(/honeypot/)
  })
  it('medium risk -> medium (a human decides)', () => expect(tokenVerdictFromResponse('0x', 200, SUSPICIOUS).risk).toBe('medium'))
  it('a high level without a hard flag is high', () => expect(tokenVerdictFromResponse('0x', 200, { riskScore: 70, riskLevel: 'high', category: 'restricted', trust: 'neutral', action: 'warn', detectors: [] }).risk).toBe('high'))
  it('404 (not an ERC-20) -> unknown; other errors throw (fail closed upstream); junk -> unknown', () => {
    expect(tokenVerdictFromResponse('0x', 404, { errors: [{ message: 'The address is neither ERC-20 nor Nft.' }] }).risk).toBe('unknown')
    expect(() => tokenVerdictFromResponse('0x', 400, {})).toThrow(/HTTP 400/)
    expect(() => tokenVerdictFromResponse('0x', 500, {})).toThrow(/HTTP 500/)
    expect(tokenVerdictFromResponse('0x', 200, { hello: 1 }).risk).toBe('unknown')
  })
})

describe('tokenScanChain', () => {
  it('maps covered EVM networks and leaves testnets to the allowlist', () => {
    expect(tokenScanChain('eip155:1')).toBe('1')
    expect(tokenScanChain('eip155:8453')).toBe('8453')
    expect(tokenScanChain('eip155:84532')).toBeNull() // Base Sepolia: the API answers 400 (recorded live)
    expect(tokenScanChain('eip155:11155111')).toBeNull()
    expect(tokenScanChain('solana:mainnet')).toBeNull()
  })
})
