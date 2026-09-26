// Telegram-independent bot logic (unit-testable). bot.ts wires these to grammY.
// The bot serves EVERY organisation on Kakunin: invites carry their organisation, and a check looks the person up in all of them.
import { checkIdentity, formatAlert, formatResult, relatesToOrg, type CheckResult, type Reader } from '@kakunin/core'
import { confirmedImpersonators, type OrgScope, type Store } from '@kakunin/core/store'

/** One organisation, as the bot needs it. */
export interface OrgHandle {
  name: string
  reader: Reader
  scope: OrgScope
  /** the org's attester signs + its HR account writes on-chain; resolves once the records are on the member's subname */
  issue(label: string, telegramId: string): Promise<{ fqn: string }>
}

export interface Deps {
  store: Store
  /** resolves any organisation Kakunin knows (null if unknown) */
  org(name: string): Promise<OrgHandle | null>
  /** names of every organisation, the reference org first */
  orgs(): Promise<string[]>
  /** push a message to Telegram chats */
  notify(chatIds: number[], text: string): Promise<void>
}

export interface Subject { telegramId?: string; username?: string; displayName?: string; needsUsername?: boolean }

const USERNAME = /^@?[A-Za-z0-9_]{4,32}$/

/** Minimal shape of the Telegram message fields we read (Bot API >= 7.0 `forward_origin`). */
export interface MsgLike {
  text?: string
  forward_origin?: {
    type: string
    sender_user?: { id: number; username?: string; first_name?: string; last_name?: string }
    sender_user_name?: string
    sender_chat?: { id: number; title?: string; username?: string }
  }
}

const fullName = (u?: { first_name?: string; last_name?: string }) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || undefined

/** Who is the check about? Forwarded message -> its ORIGINAL sender; otherwise a pasted @username / numeric ID. */
export function extractSubject(msg: MsgLike): Subject | null {
  const fo = msg.forward_origin
  if (fo) {
    if (fo.type === 'user' && fo.sender_user)
      return { telegramId: String(fo.sender_user.id), username: fo.sender_user.username, displayName: fullName(fo.sender_user) }
    // The sender hid their account: no ID, only a display name. Ask the victim to paste the @username.
    if (fo.type === 'hidden_user') return { displayName: fo.sender_user_name, needsUsername: true }
    if ((fo.type === 'chat' || fo.type === 'channel') && fo.sender_chat)
      return { telegramId: String(fo.sender_chat.id), username: fo.sender_chat.username, displayName: fo.sender_chat.title }
  }
  const t = msg.text?.trim()
  if (t && /^\d{5,}$/.test(t)) return { telegramId: t }
  if (t && USERNAME.test(t)) return { username: t.replace(/^@/, '') }
  return null
}

export const WELCOME = [
  '確認 Kakunin — is this person really from that project?',
  '',
  '• Forward me a suspicious message, or send a @username.',
  '• I look them up in every project on Kakunin and answer: ✅ verified member · 🕓 former member · ⚠️ lookalike · ❓ unknown.',
  '• To check against one project only: /check acme.eth @username',
  '• Someone impersonating a project? /report acme.eth @username. An official account looks taken over? /compromised acme.eth @username',
  '',
  'Members: open the invite link your admin sent you to get verified.',
  'Projects: create your team registry at https://kakunin.xyz/create',
].join('\n')

/** /start <token>: an invite. A member invite binds this Telegram account to its team subname and attests it on ENS; an admin
 *  invite makes this account an administrator of the organisation (alerts + team console). */
export async function handleStart(
  deps: Deps,
  from: { id: number; username?: string; first_name?: string; last_name?: string },
  payload: string,
): Promise<string> {
  if (!payload) return WELCOME
  const inv = await deps.store.peekInvite(payload)
  const org = inv ? await deps.org(inv.org ?? 'kakunin-demo.eth') : null
  if (!inv || !org) return '❌ This invite link is invalid or was already used. Ask your admin for a new one.'
  if (inv.kind === 'admin') {
    await deps.store.consumeInvite(payload)
    await org.scope.addOrgAdminChat(from.id)
    return `🔔 You now administer ${org.name}.\nImpersonation alerts for it arrive in this chat, and the Team tab of the app lets you add and revoke members.`
  }
  const telegramId = String(from.id)
  try {
    const { fqn } = await org.issue(inv.label, telegramId)
    await deps.store.consumeInvite(payload)
    await org.scope.upsertMember({ label: inv.label, telegramId, username: from.username?.toLowerCase(), displayName: fullName(from) })
    return `✅ You are now verified as ${fqn}.\nYour numeric Telegram ID is attested on ENS by ${org.name}. If you change your @username, just message me once to refresh it.`
  } catch (e) {
    return `❌ Could not complete verification: ${(e as Error).message.slice(0, 200)}`
  }
}

export interface CheckOutcome { text: string; result?: CheckResult; results?: CheckResult[] }

const RANK: Record<CheckResult['status'], number> = { verified: 0, former: 1, lookalike: 2, unknown: 3 }

/**
 * Run a check for a subject. `only` restricts it to one organisation; otherwise every organisation is asked and the most relevant
 * answer wins (verified > former > lookalike > unknown). An organisation is alerted when the person imitates one of its members or
 * is one of its former members (and, when the caller named the organisation, on any non-verified answer).
 */
export async function handleCheck(deps: Deps, subject: Subject, only?: string): Promise<CheckOutcome> {
  if (subject.needsUsername && !subject.username && !subject.telegramId)
    return { text: `This sender hides their account (shown as "${subject.displayName ?? '?'}").\nAsk them for their @username, or paste it here and I will check it.` }
  const names = only ? [only.toLowerCase()] : await deps.orgs()
  const label = subject.username ? `@${subject.username}` : (subject.displayName ?? subject.telegramId ?? 'unknown')
  const results: CheckResult[] = []
  for (const name of names) {
    const org = await deps.org(name)
    if (!org) {
      if (only) return { text: `❓ Kakunin does not know "${only}". Projects register at https://kakunin.xyz/create` }
      continue
    }
    const result = await checkIdentity(org.reader, subject, await org.scope.directory(), { impersonators: confirmedImpersonators(await org.scope.reports()) }).catch(() => null)
    if (!result) continue
    results.push(result)
    if (result.status !== 'verified' && (only || relatesToOrg(result.status))) {
      await org.scope.addAlert({ kind: result.status, subject, detail: label })
      const chats = await org.scope.adminChats()
      await deps.notify(chats, formatAlert(org.name, result.status, label)).catch(() => {})
    }
  }
  results.sort((a, b) => RANK[a.status] - RANK[b.status])
  const best = results[0]
  if (!best) return { text: '❓ I could not reach the chain right now. Try again in a moment.' }
  if (!only && best.status === 'unknown' && results.length > 1)
    return { text: `❓ Unknown to ${results.length} projects on Kakunin.\nNone of them lists ${label}. Do not trust claims of working for a project you cannot verify.`, result: best, results }
  return { text: formatResult(best), result: best, results }
}

/**
 * /report acme.eth @user [what happened]  (kind 'impersonation')  and  /compromised acme.eth @user  (kind 'compromised').
 * A report changes nothing public: it goes to the organisation's admins, who confirm it on their dashboard.
 */
export async function handleReport(deps: Deps, kind: 'impersonation' | 'compromised', orgName: string | undefined, subject: Subject | null, note?: string): Promise<string> {
  const cmd = kind === 'compromised' ? '/compromised' : '/report'
  if (!orgName) return `Name the organisation, then the account: ${cmd} acme.eth @username`
  const org = await deps.org(orgName.toLowerCase())
  if (!org) return `❓ Kakunin does not know "${orgName}".`
  if (!subject || (!subject.telegramId && !subject.username)) return `Which account? ${cmd} ${org.name} @username (or its numeric ID)`
  const current = await checkIdentity(org.reader, subject, await org.scope.directory()).catch(() => null)
  if (kind === 'impersonation' && current?.status === 'verified') return `That account is a verified member of ${org.name}. If it seems taken over, use /compromised ${org.name} @username`
  if (kind === 'compromised' && current?.status !== 'verified') return `Only a verified member of ${org.name} can be reported as compromised.`
  const report = await org.scope.addReport({ kind, subject: { telegramId: subject.telegramId, username: subject.username, displayName: subject.displayName }, note })
  if (report.count === 1) {
    const who = subject.username ? `@${subject.username}` : `ID ${subject.telegramId}`
    const text = kind === 'compromised'
      ? `🚨 ${org.name}: a verified member's account (${who}) was reported as COMPROMISED. If it is, mark it compromised on your dashboard now: https://kakunin.xyz/org/${org.name}`
      : `🚩 ${org.name}: an account was reported as impersonating you (${who}). Review it on your dashboard: https://kakunin.xyz/org/${org.name}`
    await deps.notify(await org.scope.adminChats(), text).catch(() => {})
  }
  return `Thank you. ${org.name} was notified. Nothing is published until its admins confirm the report.`
}
