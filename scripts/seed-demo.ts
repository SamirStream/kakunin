// Idempotent demo seed: attester address on the org name, then members added BY HR (proving EAC delegation)
// with their org.role / org.since records and Telegram attestations. Safe to re-run; `--dry-run` only announces txs.
import { DEMO_MEMBERS, DEPLOYMENT, listMembers, memberName, readAddress, readText, seedDemo } from '@kakunin/core'
import { fileURLToPath } from 'node:url'
import { JsonStore } from '@kakunin/core/store'
import { DRY, hrCtx, orgCtx, pub } from './_ctx'

console.log(`Kakunin demo seed — ${DRY ? 'DRY RUN' : 'SEND'} — ${DEPLOYMENT.orgName}`)
// In a dry run nothing is registered yet, so attestation issuing (which needs active members) is skipped.
await seedDemo(orgCtx(), hrCtx(), { attest: !DRY })

// The bot resolves @usernames from the shared store: make the demo members known to it (lookalike detection, /check by handle).
if (!DRY) {
  const store = new JsonStore(fileURLToPath(new URL('../data/store.json', import.meta.url)))
  for (const m of DEMO_MEMBERS) store.upsertMember({ label: m.label, telegramId: m.telegramId, username: m.username, displayName: m.displayName })
}

console.log('\n--- state ---')
console.log(`${DEPLOYMENT.orgName} addr ->`, await readAddress(pub, DEPLOYMENT.orgName))
for (const m of await listMembers(pub)) {
  const fqn = memberName(m.label)
  console.log(
    m.status.padEnd(6), fqn.padEnd(34),
    m.status === 'active'
      ? `role=${await readText(pub, fqn, 'org.role')} since=${await readText(pub, fqn, 'org.since')}`
      : `revoked ${new Date((m.revokedAt ?? 0) * 1000).toISOString()}`,
  )
}
