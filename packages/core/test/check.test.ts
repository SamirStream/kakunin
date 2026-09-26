import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { attestationRecordKey, signAttestation, toBase64 } from '../src/attestation'
import { TELEGRAM_KEY, checkIdentity, type DirectoryEntry, type Reader } from '../src/check'

const ORG = 'acme.eth'
const attester = privateKeyToAccount(generatePrivateKey())
const OWNER = '0x914066d4845a042dbb0CE6F2f0069Db75f0C1044'

async function fakeChain(opts: { aliceValid?: boolean } = {}) {
  const t = 1790000000
  const alice = `alice.team.${ORG}`
  const good = toBase64(await signAttestation({ name: alice, address: OWNER, key: TELEGRAM_KEY, value: '111', issuedAt: t }, attester))
  const forged = toBase64(
    await signAttestation({ name: alice, address: OWNER, key: TELEGRAM_KEY, value: '111', issuedAt: t }, privateKeyToAccount(generatePrivateKey())),
  )
  const texts: Record<string, string> = {
    [`${alice}|org.role`]: 'Engineer',
    [`${alice}|org.since`]: '2024-03-01',
    [`${alice}|${TELEGRAM_KEY}`]: '111',
    [`${alice}|${attestationRecordKey(TELEGRAM_KEY, ORG)}`]: opts.aliceValid === false ? forged : good,
    [`bob.team.${ORG}|org.role`]: 'DevRel',
    [`bob.team.${ORG}|${TELEGRAM_KEY}`]: '222',
  }
  const reader: Reader = {
    orgName: ORG,
    listMembers: async () => [
      { label: 'alice', status: 'active', registeredAt: t },
      { label: 'bob', status: 'former', registeredAt: t, revokedAt: t + 500 },
    ],
    getState: async () => ({ status: 'REGISTERED', expiry: t + 1e6, owner: OWNER }),
    readText: async (f, k) => texts[`${f}|${k}`] ?? null,
    readTextDirect: async (f, k) => texts[`${f}|${k}`] ?? null,
    attesterAddress: async () => attester.address,
  }
  return reader
}
const dir: DirectoryEntry[] = [
  { label: 'alice', telegramId: '111', username: 'alice_acme', displayName: 'Alice Martin' },
  { label: 'bob', telegramId: '222', username: 'bob_dev', displayName: 'Bob Tanaka' },
]

describe('checkIdentity', () => {
  it('verified member (by numeric id)', async () => {
    const r = await checkIdentity(await fakeChain(), { telegramId: '111' }, dir)
    expect(r).toMatchObject({ status: 'verified', member: { label: 'alice', role: 'Engineer', since: '2024-03-01' } })
  })
  it('verified member (by @username via directory)', async () => {
    expect((await checkIdentity(await fakeChain(), { username: '@Alice_Acme' }, dir)).status).toBe('verified')
  })
  it('revoked member -> former with date', async () => {
    const r = await checkIdentity(await fakeChain(), { telegramId: '222' }, dir)
    expect(r).toMatchObject({ status: 'former', member: { label: 'bob' }, revokedAt: 1790000500 })
  })
  it('attestation signed by the wrong key -> not verified', async () => {
    expect(await checkIdentity(await fakeChain({ aliceValid: false }), { telegramId: '111' }, dir)).toMatchObject({
      status: 'unknown', reason: 'invalid-attestation',
    })
  })
  it('impersonator with a lookalike handle -> lookalike', async () => {
    const r = await checkIdentity(await fakeChain(), { telegramId: '555', username: 'аlice_acme' }, dir)
    expect(r).toMatchObject({ status: 'lookalike', lookalikeOf: { label: 'alice' } })
  })
  it('stranger -> unknown', async () => {
    expect(await checkIdentity(await fakeChain(), { telegramId: '777', username: 'random_recruiter' }, dir)).toMatchObject({ status: 'unknown' })
  })
  it('nothing to check -> unknown/no-identifier', async () => {
    expect(await checkIdentity(await fakeChain(), {}, dir)).toMatchObject({ status: 'unknown', reason: 'no-identifier' })
  })
})
