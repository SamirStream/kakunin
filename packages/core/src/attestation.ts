// Text Record Attestations — draft ENSIP (https://github.com/ensdomains/ensips/pull/85).
//
// An attester signs a payload {n,a,k,v,t} (DAG-CBOR) with EIP-191 over keccak256(payload) and publishes a
// CBOR envelope Tag(0x61747374)[version, t, sig] as the text record `attestations[k][attesterName]`.
// A consumer rebuilds the payload from LIVE ENS data, so any change to the record/owner invalidates it.
//
// Two payload layouts exist in the wild (see specs/DECISIONS.md, spike 3):
//   - 'draft'    envelope v1, keys {n,a,k,v,t}       — the ENSIP draft text
//   - 'playground' envelope v2, keys {n,a,p,h,t}      — deployed reference verifier (atst.me), p=platform=k, h=handle=v
// We issue 'draft' and verify both. All the format knowledge lives in this file so it can be swapped
// (e.g. for an EIP-712 fallback) without touching callers.
import { decode as cborDecode, encode as cborEncode } from 'cborg'
import {
  bytesToHex, concat, getAddress, hashMessage, hexToBytes, isAddress, keccak256, recoverAddress, type Address, type Hex,
} from 'viem'
import type { LocalAccount } from 'viem'

export const ENVELOPE_TAG = 0x61747374 // "atst"
export type Layout = 'draft' | 'playground'

export interface Claim {
  /** ENS name the attestation is bound to (n) */
  name: string
  /** address that manages the name (a) */
  address: Address
  /** text record key (k) */
  key: string
  /** text record value (v) */
  value: string
  /** issuance time, unix seconds (t) */
  issuedAt: number
}

export interface Envelope {
  version: number
  issuedAt: number
  signature: Hex
}

const VERSION_BY_LAYOUT: Record<Layout, number> = { draft: 1, playground: 2 }
const LAYOUT_BY_VERSION: Record<number, Layout> = { 1: 'draft', 2: 'playground' }

/** Canonical DAG-CBOR payload bytes (cborg's default map sorting is length-then-bytewise = DAG-CBOR order). */
export function encodePayload(c: Claim, layout: Layout = 'draft'): Uint8Array {
  if (!isAddress(c.address)) throw new Error('claim: address must be a 0x-prefixed address')
  if (!Number.isSafeInteger(c.issuedAt) || c.issuedAt < 0) throw new Error('claim: issuedAt must be a non-negative integer')
  const a = hexToBytes(c.address)
  return cborEncode(
    layout === 'draft'
      ? { n: c.name, a, k: c.key, v: c.value, t: c.issuedAt }
      : { n: c.name, a, p: c.key, h: c.value, t: c.issuedAt },
  )
}

const digest = (payload: Uint8Array): Hex => keccak256(payload)

export function encodeEnvelope(e: Envelope): Hex {
  const body = cborEncode([e.version, e.issuedAt, hexToBytes(e.signature)])
  return concat([bytesToHex(new Uint8Array([0xda, 0x61, 0x74, 0x73, 0x74])), bytesToHex(body)])
}

/** Accepts `0x…` hex or base64 (the ENSIP requires consumers to accept both, told apart by the 0x prefix). */
export function decodeEnvelope(text: string): Envelope {
  const t = text.trim()
  const bytes = t.startsWith('0x') ? hexToBytes(t as Hex) : new Uint8Array(Buffer.from(t, 'base64'))
  if (bytes.length < 5 || bytes[0] !== 0xda || bytes[1] !== 0x61 || bytes[2] !== 0x74 || bytes[3] !== 0x73 || bytes[4] !== 0x74)
    throw new Error('envelope: missing atst CBOR tag')
  const arr = cborDecode(bytes.subarray(5)) as unknown
  if (!Array.isArray(arr) || arr.length < 3) throw new Error('envelope: malformed body')
  const [version, issuedAt, sig] = arr as [number, number, Uint8Array]
  if (!(sig instanceof Uint8Array) || sig.length !== 65) throw new Error('envelope: signature must be 65 bytes')
  return { version, issuedAt, signature: bytesToHex(sig) }
}

export const toBase64 = (envelopeHex: Hex): string => Buffer.from(hexToBytes(envelopeHex)).toString('base64')

/** Text record key under which the name owner publishes the envelope. */
export const attestationRecordKey = (recordKey: string, attesterName: string) => `attestations[${recordKey}][${attesterName}]`

/** Attester side: sign a claim. `issuedAt` is taken from the claim. */
export async function signAttestation(claim: Claim, attester: LocalAccount, layout: Layout = 'draft'): Promise<Hex> {
  const signature = await attester.signMessage({ message: { raw: digest(encodePayload(claim, layout)) } })
  return encodeEnvelope({ version: VERSION_BY_LAYOUT[layout], issuedAt: claim.issuedAt, signature })
}

/** Recover who signed `claim` under the layout implied by the envelope version. */
export async function recoverAttester(claim: Omit<Claim, 'issuedAt'>, env: Envelope): Promise<Address> {
  const layout = LAYOUT_BY_VERSION[env.version]
  if (!layout) throw new Error(`envelope: unsupported version ${env.version}`)
  const hash = digest(encodePayload({ ...claim, issuedAt: env.issuedAt }, layout))
  return recoverAddress({ hash: hashMessage({ raw: hash }), signature: env.signature })
}

export type VerifyResult =
  | { valid: true; signer: Address; issuedAt: number; version: number }
  | { valid: false; reason: 'malformed' | 'signer-mismatch'; detail?: string }

/**
 * Consumer side. `claim` MUST come from live ENS data (owner, current record value); `expectedAttester` is the
 * address the attester's ENS name currently resolves to. Any drift => signer-mismatch.
 */
export async function verifyAttestation(
  claim: Omit<Claim, 'issuedAt'>,
  envelopeText: string,
  expectedAttester: Address,
): Promise<VerifyResult> {
  let env: Envelope
  try {
    env = decodeEnvelope(envelopeText)
  } catch (e) {
    return { valid: false, reason: 'malformed', detail: (e as Error).message }
  }
  let signer: Address
  try {
    signer = await recoverAttester(claim, env)
  } catch (e) {
    return { valid: false, reason: 'malformed', detail: (e as Error).message }
  }
  return getAddress(signer) === getAddress(expectedAttester)
    ? { valid: true, signer, issuedAt: env.issuedAt, version: env.version }
    : { valid: false, reason: 'signer-mismatch' }
}
