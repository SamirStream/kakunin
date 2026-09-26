// Read-only: prints the org registry state (members, roles, attester address).
import { DEPLOYMENT, listMembers, memberName, readAddress, readText } from '@kakunin/core'
import { pub } from './_ctx'

console.log(DEPLOYMENT.orgName, 'addr ->', await readAddress(pub, DEPLOYMENT.orgName))
for (const m of await listMembers(pub)) {
  const fqn = memberName(m.label)
  console.log(m.status.padEnd(6), fqn.padEnd(34), m.status === 'active' ? `role=${await readText(pub, fqn, 'org.role')} since=${await readText(pub, fqn, 'org.since')}` : `revoked ${new Date((m.revokedAt ?? 0) * 1000).toISOString()}`)
}
