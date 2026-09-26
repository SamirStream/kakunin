// The Kakunin check: "is this person really a member of <org>?" -> verified | former | lookalike | unknown.
// On-chain (ENSv2 registry + text records + attestation) is the source of truth; the off-chain `directory`
// (built by the bot at onboarding) only maps @username / display name -> numeric Telegram ID -> member label.
import { decodeAbiParameters, encodeFunctionData, namehash, parseAbi, type Address, type LocalAccount, type PublicClient } from 'viem'
import { attestationRecordKey, signAttestation, toBase64, verifyAttestation, type VerifyResult } from './attestation'
import {
  ABIS, DEPLOYMENT, dnsName, getMemberState, listMembers, readAddress, readText, setMemberText,
  type Deployment, type MemberRecord, type MemberState, type TxCtx,
} from './ens'
import { findLookalike } from './lookalike'

export const TELEGRAM_KEY = 'org.telegram.id'

export interface DirectoryEntry { label: string; telegramId: string; username?: string; displayName?: string }
/** An account an admin of the organisation confirmed as impersonating it (off-chain, per organisation). */
export interface Impersonator { telegramId?: string; username?: string; at: number; note?: string }
export interface CheckOptions { impersonators?: Impersonator[] }
export interface CheckInput { telegramId?: string; username?: string; displayName?: string }

export interface MemberInfo { label: string; fqn: string; role: string | null; since: string | null; telegramId: string }

/** Everything a third party needs to re-verify a "verified" answer without trusting Kakunin. */
export interface Proof {
  chain: 'sepolia'
  /** the member's ENS name, and the address that manages it (the org) */
  name: string
  owner: Address
  /** who signed: the org's ENS name and the address it currently resolves to */
  attesterName: string
  attester: Address
  /** text record that holds the envelope, and the envelope itself (base64 CBOR, draft ENSIP "Text Record Attestations") */
  recordKey: string
  envelope: string
  teamRegistry: Address
  teamResolver: Address
}

export type CheckResult =
  | { status: 'verified'; org: string; member: MemberInfo; attestation: Extract<VerifyResult, { valid: true }>; proof: Proof }
  /** compromised: the organisation marked this member's account as taken over (org.status record), so even "official" messages from it are untrusted */
  | { status: 'former'; org: string; member: MemberInfo; revokedAt: number | null; compromised?: boolean }
  /** confirmed: an admin of the organisation confirmed a report that this account impersonates it (lookalikeOf is set when it also resembles a member) */
  | { status: 'lookalike'; org: string; lookalikeOf?: { label: string; fqn: string; handle: string }; distance?: number; confirmed?: { at: number; note?: string } }
  | { status: 'unknown'; org: string; reason?: 'invalid-attestation' | 'no-identifier' }

/** A non-verified answer only matters to an organisation when the person relates to it: an ex-member, or someone imitating a member. */
export const relatesToOrg = (status: CheckResult['status']) => status === 'former' || status === 'lookalike'

/** Everything the check needs from the chain, so the orchestration can be unit-tested with a fake. */
export interface Reader {
  orgName: string
  /** the organisation's ENSv2 deployment (registries and resolvers named in a Proof) */
  deployment: Deployment
  listMembers(): Promise<MemberRecord[]>
  getState(label: string): Promise<MemberState>
  /** via UniversalResolverV2 (active names only) */
  readText(fqn: string, key: string): Promise<string | null>
  /** straight from the team resolver contract (works for revoked names: unregister does not clear records) */
  readTextDirect(fqn: string, key: string): Promise<string | null>
  attesterAddress(): Promise<Address | null>
}

const TEXT_ABI = parseAbi(['function text(bytes32 node, string key) view returns (string)'])

export function chainReader(pub: PublicClient, d = DEPLOYMENT): Reader {
  return {
    orgName: d.orgName,
    deployment: d,
    listMembers: () => listMembers(pub, d),
    getState: (label) => getMemberState(pub, label, d),
    readText: (fqn, key) => readText(pub, fqn, key, d),
    async readTextDirect(fqn, key) {
      try {
        const data = encodeFunctionData({ abi: TEXT_ABI, functionName: 'text', args: [namehash(fqn), key] })
        const raw = (await pub.readContract({
          address: d.teamResolver, abi: ABIS.resolver, functionName: 'resolve', args: [dnsName(fqn), data],
        })) as `0x${string}`
        const [value] = decodeAbiParameters([{ type: 'string' }], raw)
        return value || null
      } catch {
        return null
      }
    },
    attesterAddress: () => readAddress(pub, d.orgName, d),
  }
}

const strip = (h: string) => h.trim().replace(/^@/, '').toLowerCase()
const fqnOf = (org: string, label: string) => `${label}.team.${org}`

async function loadMember(r: Reader, m: MemberRecord, active: boolean) {
  const fqn = fqnOf(r.orgName, m.label)
  const read = active ? r.readText : r.readTextDirect
  const [role, since, id] = await Promise.all([read(fqn, 'org.role'), read(fqn, 'org.since'), read(fqn, TELEGRAM_KEY)])
  return { info: { label: m.label, fqn, role, since, telegramId: id ?? '' } satisfies MemberInfo, onchainId: id }
}

export async function checkIdentity(r: Reader, input: CheckInput, directory: DirectoryEntry[], opts: CheckOptions = {}): Promise<CheckResult> {
  const org = r.orgName
  const byUser = input.username ? directory.find((e) => e.username && strip(e.username) === strip(input.username!)) : undefined
  const telegramId = input.telegramId ?? byUser?.telegramId
  if (!telegramId && !input.username && !input.displayName) return { status: 'unknown', org, reason: 'no-identifier' }

  if (telegramId) {
    // Match on-chain: the org.telegram.id record is the identity binding (usernames are mutable, IDs are not).
    for (const m of await r.listMembers()) {
      const active = m.status === 'active'
      const { info, onchainId } = await loadMember(r, m, active)
      if (onchainId !== telegramId) continue
      if (!active) {
        const compromised = (await r.readTextDirect(info.fqn, 'org.status')) === 'compromised'
        return { status: 'former', org, member: info, revokedAt: m.revokedAt ?? null, ...(compromised ? { compromised: true } : {}) }
      }
      const [envelope, attester, state] = await Promise.all([
        r.readText(info.fqn, attestationRecordKey(TELEGRAM_KEY, org)), r.attesterAddress(), r.getState(m.label),
      ])
      if (!envelope || !attester) return { status: 'unknown', org, reason: 'invalid-attestation' }
      const res = await verifyAttestation({ name: info.fqn, address: state.owner, key: TELEGRAM_KEY, value: telegramId }, envelope, attester)
      if (!res.valid) return { status: 'unknown', org, reason: 'invalid-attestation' }
      const proof: Proof = {
        chain: 'sepolia', name: info.fqn, owner: state.owner, attesterName: org, attester,
        recordKey: attestationRecordKey(TELEGRAM_KEY, org), envelope, teamRegistry: r.deployment.teamRegistry, teamResolver: r.deployment.teamResolver,
      }
      return { status: 'verified', org, member: info, attestation: res, proof }
    }
  }

  // Not a member (past or present): does the handle / display name imitate one?
  const candidates = directory.map((e) => ({ id: e.label, values: [e.username, e.displayName, e.label].filter(Boolean) as string[] }))
  // An admin already confirmed this account as an impersonator: say so, whether or not it resembles a member.
  const reported = (opts.impersonators ?? []).find((i) => (i.telegramId && i.telegramId === telegramId) || (i.username && input.username && strip(i.username) === strip(input.username)))
  if (reported) {
    const near = [input.username, input.displayName].filter(Boolean).map((q) => findLookalike(q as string, candidates)).find(Boolean)
    return {
      status: 'lookalike', org, confirmed: { at: reported.at, ...(reported.note ? { note: reported.note } : {}) },
      ...(near ? { lookalikeOf: { label: near.id, fqn: fqnOf(org, near.id), handle: near.value }, distance: near.distance } : {}),
    }
  }
  for (const q of [input.username, input.displayName].filter(Boolean) as string[]) {
    const hit = findLookalike(q, candidates)
    if (hit) return { status: 'lookalike', org, lookalikeOf: { label: hit.id, fqn: fqnOf(org, hit.id), handle: hit.value }, distance: hit.distance }
  }
  return { status: 'unknown', org }
}

/**
 * Onboarding: the ORG key signs the attestation (the org ENS name is the attester); the HR key writes both records on
 * the member's subname (HR holds ROLE_SET_TEXT on the team resolver only).
 */
export async function issueTelegramAttestation(
  args: { org: { account: LocalAccount }; hr: TxCtx; label: string; telegramId: string },
  d = DEPLOYMENT,
) {
  const state = await getMemberState(args.hr.pub, args.label, d)
  if (state.status !== 'REGISTERED') throw new Error(`${args.label} is not an active member`)
  const fqn = fqnOf(d.orgName, args.label)
  // Idempotent: keep the existing attestation if it still verifies for this ID.
  const [current, attesterNow] = await Promise.all([
    readText(args.hr.pub, fqn, attestationRecordKey(TELEGRAM_KEY, d.orgName), d), readAddress(args.hr.pub, d.orgName, d),
  ])
  if (current && attesterNow && (await verifyAttestation({ name: fqn, address: state.owner, key: TELEGRAM_KEY, value: args.telegramId }, current, attesterNow)).valid)
    return { fqn, envelope: null, skipped: true as const }
  const envelope = await signAttestation(
    { name: fqn, address: state.owner, key: TELEGRAM_KEY, value: args.telegramId, issuedAt: Math.floor(Date.now() / 1000) },
    args.org.account,
  )
  await setMemberText(args.hr, args.label, TELEGRAM_KEY, args.telegramId, d)
  await setMemberText(args.hr, args.label, attestationRecordKey(TELEGRAM_KEY, d.orgName), toBase64(envelope), d)
  return { fqn, envelope, skipped: false as const }
}
