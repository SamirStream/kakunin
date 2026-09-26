// Full demo rehearsal against the LIVE Sepolia deployment, with assertions. Run before every demo / after every change:
//   pnpm rehearse            (sends a few txs: revoke Bob, then re-seed)
// It follows docs/DEMO.md step by step and exits non-zero if any expectation fails.
import { DEMO_MEMBERS, chainReader, checkIdentity, revokeDemoMember, seedDemo, type CheckResult, type DirectoryEntry } from '@kakunin/core'
import { hrCtx, orgCtx, pub } from './_ctx'

const directory: DirectoryEntry[] = DEMO_MEMBERS.map((m) => ({ label: m.label, telegramId: m.telegramId, username: m.username, displayName: m.displayName }))
const reader = chainReader(pub)
const org = orgCtx()
const hr = { ...hrCtx(), log: () => {} }
org.log = () => {}

let failures = 0
async function step(name: string, fn: () => Promise<void>) {
  const t0 = Date.now()
  try {
    await fn()
    console.log(`  ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  } catch (e) {
    failures++
    console.log(`  FAIL ${name}: ${(e as Error).message}`)
  }
}
const expect = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg) }
const check = (input: Parameters<typeof checkIdentity>[1]): Promise<CheckResult> => checkIdentity(reader, input, directory)

console.log('Kakunin demo rehearsal — kakunin-demo.eth (Sepolia)')
await step('0. baseline: seed is idempotent and everyone is active', async () => {
  await seedDemo(org, hr)
  expect((await check({ telegramId: '100000002' })).status === 'verified', 'bob should start verified')
})
await step('1. stranger "recruiter from KakuninDemo" -> unknown', async () => {
  const r = await check({ telegramId: '777000777', username: 'satoshi_recruiter', displayName: 'Satoshi R.' })
  expect(r.status === 'unknown', `got ${r.status}`)
})
await step('2. lookalike of alice -> lookalike', async () => {
  const r = await check({ telegramId: '555', username: 'alice_kakunn' })
  expect(r.status === 'lookalike' && r.lookalikeOf?.label === 'alice', `got ${r.status}`)
})
await step('3. the real alice -> verified, attestation signed by the org ENS name', async () => {
  const r = await check({ telegramId: '100000001' })
  expect(r.status === 'verified', `got ${r.status}`)
  if (r.status === 'verified') expect(r.attestation.signer.toLowerCase() === org.account.address.toLowerCase(), 'signer is not the org address')
})
await step('4. HR revokes bob live -> former (date from events) ', async () => {
  await revokeDemoMember(hr, 'bob')
  const r = await check({ telegramId: '100000002' })
  expect(r.status === 'former', `got ${r.status}`)
  if (r.status === 'former') expect(r.revokedAt && Date.now() / 1000 - r.revokedAt < 300, 'revocation date not recent')
})
await step('5. reset -> bob verified again (demo can be replayed)', async () => {
  await seedDemo(org, hr)
  expect((await check({ telegramId: '100000002' })).status === 'verified', 'bob should be verified after reset')
})
console.log(failures ? `\n${failures} step(s) FAILED` : '\nAll steps passed: demo is safe to run.')
process.exit(failures ? 1 : 0)
