// Telegram-independent bot logic (unit-testable). index.ts wires these to grammY.
import { checkIdentity, formatAlert, formatResult, type CheckResult, type DirectoryEntry, type Reader } from '@kakunin/core'
import type { JsonStore } from '@kakunin/core/store'

export interface Deps {
  store: JsonStore
  reader: Reader
  org: string
  /** ORG signs + HR writes on-chain; resolves once the records are on the member's subname */
  issue(label: string, telegramId: string): Promise<{ fqn: string }>
  /** push a message to the org admin chats */
  notifyAdmins(text: string): Promise<void>
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
  '• I answer: ✅ verified member · 🕓 former member · ⚠️ lookalike · ❓ unknown.',
  '',
  'Members: open the invite link your HR sent you to get verified.',
].join('\n')

/** /start <token>: bind this Telegram account (numeric ID) to the invited member and attest it on ENS. */
export async function handleStart(
  deps: Deps,
  from: { id: number; username?: string; first_name?: string; last_name?: string },
  payload: string,
): Promise<string> {
  if (!payload) return WELCOME
  const inv = deps.store.peekInvite(payload)
  if (!inv) return '❌ This invite link is invalid or was already used. Ask your HR for a new one.'
  const telegramId = String(from.id)
  try {
    const { fqn } = await deps.issue(inv.label, telegramId)
    deps.store.consumeInvite(payload)
    deps.store.upsertMember({
      label: inv.label, telegramId, username: from.username?.toLowerCase(), displayName: fullName(from),
    })
    return `✅ You are now verified as ${fqn}.\nYour numeric Telegram ID is attested on ENS by ${deps.org}. If you change your @username, just message me once to refresh it.`
  } catch (e) {
    return `❌ Could not complete verification: ${(e as Error).message.slice(0, 200)}`
  }
}

export interface CheckOutcome { text: string; result?: CheckResult }

/** Run a check for a subject and alert the org when it is not a verified member. */
export async function handleCheck(deps: Deps, subject: Subject): Promise<CheckOutcome> {
  if (subject.needsUsername && !subject.username && !subject.telegramId)
    return { text: `This sender hides their account (shown as "${subject.displayName ?? '?'}").\nAsk them for their @username, or paste it here and I will check it.` }
  const directory: DirectoryEntry[] = deps.store.read().directory
  const result = await checkIdentity(deps.reader, subject, directory)
  if (result.status !== 'verified') {
    const label = subject.username ? `@${subject.username}` : (subject.displayName ?? subject.telegramId ?? 'unknown')
    deps.store.addAlert({ org: deps.org, kind: result.status, subject, detail: label })
    await deps.notifyAdmins(formatAlert(deps.org, result.status, label)).catch(() => {})
  }
  return { text: formatResult(result), result }
}
