import { describe, expect, it } from 'vitest'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { bytesToHex } from 'viem'
import {
  attestationRecordKey, decodeEnvelope, encodeEnvelope, encodePayload, signAttestation, toBase64, verifyAttestation,
} from '../src/attestation'

// REAL mainnet vector, verified valid by https://playground.atst.me/api/verify on 2026-09-26:
// jkm.eth / com.x / jkm__eth attested by atst.lighthousegov.eth (envelope v2, payload keys n,a,p,h,t).
const VECTOR = {
  claim: { name: 'jkm.eth', address: '0x7c80435964Bde8071e1D3Df76Da870C2F03b44F2', key: 'com.x', value: 'jkm__eth' } as const,
  envelope: '0xda6174737483021a69f36be15841319a33a342b85d5d815f84a9124c25b6bc34eab9177bc10222d582abe94cea965b16ee010ebf0cfad8cddeb8079a4b2475fb70d7712f941b7f4ddf0375a450e91b' as const,
  payload: '0xa56161547c80435964bde8071e1d3df76da870c2f03b44f26168686a6b6d5f5f657468616e676a6b6d2e657468617065636f6d2e7861741a69f36be1',
  attester: '0xf82A259381f5632A0b12E6720C8C216B7c659783' as const,
  issuedAt: 1777560545,
}

describe('compat with the deployed atst.me reference verifier', () => {
  it('rebuilds the exact payload bytes of a real attestation', () => {
    const bytes = encodePayload({ ...VECTOR.claim, issuedAt: VECTOR.issuedAt }, 'playground')
    expect(bytesToHex(bytes)).toBe(VECTOR.payload)
  })
  it('recovers the real attester from the real envelope', async () => {
    const r = await verifyAttestation(VECTOR.claim, VECTOR.envelope, VECTOR.attester)
    expect(r).toMatchObject({ valid: true, version: 2, issuedAt: VECTOR.issuedAt })
  })
  it('re-encodes the decoded envelope byte-for-byte', () => {
    expect(encodeEnvelope(decodeEnvelope(VECTOR.envelope))).toBe(VECTOR.envelope)
  })
  it('rejects the real envelope if the record value changed', async () => {
    const r = await verifyAttestation({ ...VECTOR.claim, value: 'someone_else' }, VECTOR.envelope, VECTOR.attester)
    expect(r.valid).toBe(false)
  })
})

describe('draft ENSIP layout (envelope v1, keys n,a,k,v,t)', () => {
  const attester = privateKeyToAccount(generatePrivateKey())
  const claim = { name: 'alice.team.kakunin-demo.eth', address: '0x914066d4845a042dbb0CE6F2f0069Db75f0C1044', key: 'org.telegram.id', value: '123456789', issuedAt: 1790000000 } as const

  it('sign -> verify round trip (hex and base64)', async () => {
    const env = await signAttestation(claim, attester)
    expect(decodeEnvelope(env).version).toBe(1)
    expect((await verifyAttestation(claim, env, attester.address)).valid).toBe(true)
    expect((await verifyAttestation(claim, toBase64(env), attester.address)).valid).toBe(true)
  })
  it('tampered value -> invalid', async () => {
    const env = await signAttestation(claim, attester)
    const r = await verifyAttestation({ ...claim, value: '999' }, env, attester.address)
    expect(r).toEqual({ valid: false, reason: 'signer-mismatch' })
  })
  it('owner/manager changed -> invalid', async () => {
    const env = await signAttestation(claim, attester)
    const r = await verifyAttestation({ ...claim, address: '0x047323424d63D708755F7253ACe78bd7B241cD07' }, env, attester.address)
    expect(r.valid).toBe(false)
  })
  it('attester key rotated (name now resolves elsewhere) -> invalid', async () => {
    const env = await signAttestation(claim, attester)
    const other = privateKeyToAccount(generatePrivateKey())
    expect((await verifyAttestation(claim, env, other.address)).valid).toBe(false)
  })
  it('malformed envelope -> malformed, never throws', async () => {
    expect(await verifyAttestation(claim, '0xdeadbeef', attester.address)).toMatchObject({ valid: false, reason: 'malformed' })
    expect(await verifyAttestation(claim, 'not-base64!!', attester.address)).toMatchObject({ valid: false })
  })
  it('record key follows attestations[RECORD_KEY][ATTESTER_NAME]', () => {
    expect(attestationRecordKey('org.telegram.id', 'kakunin-demo.eth')).toBe('attestations[org.telegram.id][kakunin-demo.eth]')
  })
})
