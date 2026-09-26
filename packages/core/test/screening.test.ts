import { describe, expect, it } from 'vitest'
import { decidePayment, type AddressVerdict, type PaymentRequest, type Policy } from '../src/screening'

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF89'
const policy: Policy = {
  trustedAssets: { 'eip155:84532': [USDC.toLowerCase()] },
  decimals: 6, maxAmountUsd: 1, askAboveUsd: 0.1, refuseAt: 'high', askAt: 'medium',
}
const req = (over: Partial<PaymentRequest> = {}): PaymentRequest => ({ payTo: '0xabc', asset: USDC, network: 'eip155:84532', amount: '1000', ...over })
const verdict = (risk: AddressVerdict['risk'], reasons: string[] = []): AddressVerdict => ({ address: '0xabc', risk, reasons })

describe('decidePayment', () => {
  it('pays a low-risk address within limits', () => {
    expect(decidePayment(req(), verdict('low'), policy).action).toBe('pay')
  })
  it('refuses a sanctioned / high-risk payTo and shows the reason', () => {
    const d = decidePayment(req(), verdict('critical', ['OFAC sanctioned']), policy)
    expect(d.action).toBe('refuse')
    expect(d.reasons.join(' ')).toMatch(/OFAC sanctioned/)
  })
  it('asks a human on medium risk', () => {
    expect(decidePayment(req(), verdict('medium', ['scam exposure']), policy).action).toBe('ask-human')
  })
  it('refuses a lookalike token even when the address is clean', () => {
    const d = decidePayment(req({ asset: '0x0000000000000000000000000000000000000bad' }), verdict('low'), policy)
    expect(d.action).toBe('refuse')
    expect(d.reasons[0]).toMatch(/lookalike token/)
  })
  it('refuses on an unknown network (no trusted assets)', () => {
    expect(decidePayment(req({ network: 'eip155:1' }), verdict('low'), policy).action).toBe('refuse')
  })
  it('enforces the hard spending limit', () => {
    expect(decidePayment(req({ amount: '2000000' }), verdict('low'), policy).action).toBe('refuse')
  })
  it('asks a human above the auto-approve amount', () => {
    expect(decidePayment(req({ amount: '500000' }), verdict('low'), policy).action).toBe('ask-human')
  })
  it('FAILS CLOSED when screening errors', () => {
    const d = decidePayment(req(), new Error('timeout'), policy)
    expect(d.action).toBe('ask-human')
    expect(d.reasons[0]).toMatch(/screening unavailable/)
  })
  it('unknown risk never auto-pays', () => {
    expect(decidePayment(req(), verdict('unknown'), policy).action).toBe('ask-human')
  })
  it('rejects nonsense amounts', () => {
    expect(decidePayment(req({ amount: '0' }), verdict('low'), policy).action).toBe('refuse')
    expect(decidePayment(req({ amount: 'abc' }), verdict('low'), policy).action).toBe('refuse')
  })
})
