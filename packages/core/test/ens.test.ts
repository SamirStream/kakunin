import { describe, expect, it } from 'vitest'
import { HR_REGISTRY_ROLES, ROLE, dnsName, labelhash, memberName } from '../src/ens'

describe('ens helpers', () => {
  it('labelhash = keccak256(label)', () => {
    expect(labelhash('eth')).toBe(0x4f5b812789fc606be1b3b16908db13fc7a9adf7ca72641f84d75b47069d3d7f0n)
  })
  it('dnsName encodes the packet form used by the resolver setters', () => {
    expect(dnsName('alice.team.kakunin-demo.eth')).toBe('0x05616c696365047465616d0c6b616b756e696e2d64656d6f0365746800')
  })
  it('member fqn sits under team.<org>', () => {
    expect(memberName('alice')).toBe('alice.team.kakunin-demo.eth')
  })
  it('HR gets registrar+unregister+renew only (no set-resolver / set-subregistry)', () => {
    expect(HR_REGISTRY_ROLES).toBe(69633n)
    expect(HR_REGISTRY_ROLES & (ROLE.SET_RESOLVER | ROLE.SET_SUBREGISTRY)).toBe(0n)
  })
})
