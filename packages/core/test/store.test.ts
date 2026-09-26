import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonStore } from '../src/store'
import { formatAlert, formatResult } from '../src/messages'

const fresh = () => new JsonStore(join(mkdtempSync(join(tmpdir(), 'kakunin-')), 'store.json'))

describe('JsonStore', () => {
  it('invites are single-use', () => {
    const s = fresh()
    const inv = s.createInvite('alice')
    expect(s.peekInvite(inv.token)?.label).toBe('alice')
    expect(s.consumeInvite(inv.token)?.label).toBe('alice')
    expect(s.consumeInvite(inv.token)).toBeNull()
    expect(s.consumeInvite('nope')).toBeNull()
  })
  it('refreshIdentity updates a known ID username, ignores unknown IDs', () => {
    const s = fresh()
    s.upsertMember({ label: 'alice', telegramId: '1', username: 'old_name' })
    expect(s.refreshIdentity('1', 'New_Name', 'Alice M')).toBe(true)
    expect(s.read().directory[0]).toMatchObject({ username: 'new_name', displayName: 'Alice M' })
    expect(s.refreshIdentity('1', 'new_name', 'Alice M')).toBe(false)
    expect(s.refreshIdentity('999', 'x', 'y')).toBe(false)
  })
  it('alerts are newest-first', () => {
    const s = fresh()
    s.addAlert({ org: 'o.eth', kind: 'unknown', subject: { username: 'a' }, detail: '1' })
    s.addAlert({ org: 'o.eth', kind: 'lookalike', subject: { username: 'b' }, detail: '2' })
    expect(s.read().alerts.map((a) => a.detail)).toEqual(['2', '1'])
  })
})

describe('messages', () => {
  it('renders the four statuses with their emoji', () => {
    const member = { label: 'a', fqn: 'a.team.o.eth', role: 'Eng', since: '2024-01-01', telegramId: '1' }
    expect(formatResult({ status: 'verified', org: 'o.eth', member, attestation: { valid: true, signer: '0x0000000000000000000000000000000000000001', issuedAt: 1790000000, version: 1 } })).toMatch(/^✅/)
    expect(formatResult({ status: 'former', org: 'o.eth', member, revokedAt: 1790000000 })).toMatch(/^🕓.*\n.*revoked on 2026-/s)
    expect(formatResult({ status: 'lookalike', org: 'o.eth', lookalikeOf: { label: 'a', fqn: 'a.team.o.eth', handle: 'alice' }, distance: 1 })).toMatch(/^⚠️/)
    expect(formatResult({ status: 'unknown', org: 'o.eth' })).toMatch(/^❓/)
  })
  it('alert wording', () => {
    expect(formatAlert('o.eth', 'lookalike', '@x')).toMatch(/impersonation/)
  })
})
