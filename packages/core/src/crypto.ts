// Sealing for the per-organisation operator keys held by Kakunin (self-serve orgs). AES-256-GCM with a key derived from
// KAKUNIN_KEY_SECRET: a leaked database alone does not reveal a key. Node-only. These are TESTNET keys with least-privilege
// roles (see provision.ts); the owner can revoke them on-chain at any time.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const keyOf = (secret: string) => {
  if (secret.length < 16) throw new Error('KAKUNIN_KEY_SECRET must be at least 16 characters')
  return createHash('sha256').update(`kakunin/operator-key/v1:${secret}`).digest()
}

/** base64url(iv[12] | tag[16] | ciphertext) */
export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url')
}

export function openSecret(sealed: string, secret: string): string {
  const raw = Buffer.from(sealed, 'base64url')
  if (raw.length < 29) throw new Error('sealed secret is malformed')
  const d = createDecipheriv('aes-256-gcm', keyOf(secret), raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
}
