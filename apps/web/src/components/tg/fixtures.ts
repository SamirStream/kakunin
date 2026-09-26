// Sample data for the Mini App preview mode (opened outside Telegram). Real checks still hit the public engine.
import type { CheckResult } from '@kakunin/core'

export interface Me {
  user: { id: number; name: string; username: string | null; photo: string | null }
  admin: boolean
  startParam: string | null
  result: CheckResult
}
export interface AdminData {
  org: string
  members: { label: string; fqn: string; status: 'active' | 'former'; role: string | null; since: string | null; telegramId: string | null; username: string | null }[]
  alerts: { id: string; at: number; kind: string; detail: string }[]
  stats: { active: number; revoked: number; attested: number; alerts24h: number }
}

const alice = { label: 'alice', fqn: 'alice.team.kakunin-demo.eth', role: 'Senior Engineer', since: '2024-03-01', telegramId: '100000001' }
const proof = {
  chain: 'sepolia' as const, name: alice.fqn, owner: '0x914066d4845a042dbb0CE6F2f0069Db75f0C1044' as const, attesterName: 'kakunin-demo.eth',
  attester: '0x914066d4845a042dbb0CE6F2f0069Db75f0C1044' as const, recordKey: 'attestations[org.telegram.id][kakunin-demo.eth]',
  envelope: '2GF0c3SDAhpp9Q9oQUE…(sample)', teamRegistry: '0x40C390A61baf66cA6b56B521Be95432FDDC2867f' as const, teamResolver: '0x010E2B034f5a94b9F660A4eac40aEbfA4442226D' as const,
}
const verified: CheckResult = {
  status: 'verified', org: 'kakunin-demo.eth', member: alice,
  attestation: { valid: true, signer: proof.attester, issuedAt: 1790425100, version: 1 }, proof,
}

export const PREVIEW_ME: Record<'member' | 'admin' | 'guest', Me> = {
  member: { user: { id: 100000001, name: 'Alice Martin', username: 'alice_kakunin', photo: null }, admin: false, startParam: null, result: verified },
  admin: { user: { id: 100000001, name: 'Alice Martin', username: 'alice_kakunin', photo: null }, admin: true, startParam: null, result: verified },
  guest: { user: { id: 555000555, name: 'New Visitor', username: null, photo: null }, admin: false, startParam: null, result: { status: 'unknown', org: 'kakunin-demo.eth' } },
}

export const PREVIEW_ADMIN: AdminData = {
  org: 'kakunin-demo.eth',
  members: [
    { label: 'alice', fqn: alice.fqn, status: 'active', role: 'Senior Engineer', since: '2024-03-01', telegramId: '100000001', username: 'alice_kakunin' },
    { label: 'bob', fqn: 'bob.team.kakunin-demo.eth', status: 'active', role: 'Developer Relations', since: '2025-01-15', telegramId: '100000002', username: 'bob_kakunin' },
    { label: 'carol', fqn: 'carol.team.kakunin-demo.eth', status: 'active', role: 'Designer', since: '2026-09-27', telegramId: null, username: null },
  ],
  alerts: [
    { id: 'a1', at: Date.now() - 120_000, kind: 'lookalike', detail: '@alice_kakunn' },
    { id: 'a2', at: Date.now() - 600_000, kind: 'unknown', detail: '@satoshi_recruiter' },
  ],
  stats: { active: 3, revoked: 0, attested: 2, alerts24h: 2 },
}
