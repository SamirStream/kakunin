// Demo org content + idempotent seeding, shared by scripts/seed-demo.ts and the web /demo controls.
import type { LocalAccount } from 'viem'
import { issueTelegramAttestation } from './check'
import { addMember, revokeMember, setAttesterAddress, setMemberText, type TxCtx } from './ens'

export const DEMO_MEMBERS = [
  { label: 'alice', role: 'Senior Engineer', since: '2024-03-01', telegramId: '100000001', username: 'alice_kakunin', displayName: 'Alice Martin' },
  { label: 'bob', role: 'Developer Relations', since: '2025-01-15', telegramId: '100000002', username: 'bob_kakunin', displayName: 'Bob Tanaka' },
] as const

type Ctx = TxCtx & { account: LocalAccount }

/** Make the chain match the demo script: attester address set, every demo member registered, described and attested. */
export async function seedDemo(org: Ctx, hr: TxCtx, opts: { attest?: boolean } = {}) {
  await setAttesterAddress(org, org.account.address)
  for (const m of DEMO_MEMBERS) {
    await addMember(hr, m.label)
    await setMemberText(hr, m.label, 'org.role', m.role)
    await setMemberText(hr, m.label, 'org.since', m.since)
    // Demo Telegram IDs are placeholders; real members get theirs at bot onboarding (same call).
    if (opts.attest !== false) await issueTelegramAttestation({ org, hr, label: m.label, telegramId: m.telegramId })
  }
}

/** Live-demo "wow" action: HR revokes a member. */
export const revokeDemoMember = (hr: TxCtx, label: string) => revokeMember(hr, label)
