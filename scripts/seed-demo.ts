// Idempotent demo seed: attester address on the org name, then members added BY HR (proving EAC delegation)
// with their org.role / org.since records. Safe to re-run; `--dry-run` only announces transactions.
import { DEPLOYMENT, addMember, issueTelegramAttestation, listMembers, memberName, readAddress, readText, setAttesterAddress, setMemberText } from '@kakunin/core'
import { DRY, hrCtx, orgCtx, pub } from './_ctx'

export const DEMO_MEMBERS = [
  { label: 'alice', role: 'Senior Engineer', since: '2024-03-01', telegramId: '100000001' },
  { label: 'bob', role: 'Developer Relations', since: '2025-01-15', telegramId: '100000002' },
] as const

const org = orgCtx()
const hr = hrCtx()
console.log(`Kakunin demo seed — ${DRY ? 'DRY RUN' : 'SEND'} — ${DEPLOYMENT.orgName}`)

await setAttesterAddress(org, org.account.address)
for (const m of DEMO_MEMBERS) {
  await addMember(hr, m.label)
  await setMemberText(hr, m.label, 'org.role', m.role)
  await setMemberText(hr, m.label, 'org.since', m.since)
  // Demo Telegram IDs are placeholders; real members get theirs at bot onboarding (same call).
  if (!DRY) await issueTelegramAttestation({ org, hr, label: m.label, telegramId: m.telegramId })
}

console.log('\n--- state ---')
console.log(`${DEPLOYMENT.orgName} addr ->`, await readAddress(pub, DEPLOYMENT.orgName))
for (const m of await listMembers(pub)) {
  const fqn = memberName(m.label)
  console.log(m.status.padEnd(6), fqn.padEnd(34), m.status === 'active' ? `role=${await readText(pub, fqn, 'org.role')} since=${await readText(pub, fqn, 'org.since')}` : `revoked ${new Date((m.revokedAt ?? 0) * 1000).toISOString()}`)
}
