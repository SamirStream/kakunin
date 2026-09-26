import { addMember, setMemberText } from '@kakunin/core'
import { LABEL_RE, dropTeamCaches, isResponse, signer, tgAdmin } from '@/lib/tg'
import { botUsername, json, store } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { label, role, since? }: register a member (HR wallet, on-chain) and mint its one-time Telegram invite. Also used to
// re-issue an invite for an existing member ({ label } only).
export async function POST(req: Request) {
  const a = await tgAdmin(req)
  if (isResponse(a)) return a
  const { label, role, since } = (await req.json().catch(() => ({}))) as { label?: string; role?: string; since?: string }
  if (!label || !LABEL_RE.test(label)) return json({ error: 'invalid_label', message: 'Use a-z, 0-9 and dashes (max 32).' }, 400)
  if (role && role.length > 60) return json({ error: 'role_too_long' }, 400)
  try {
    const hr = signer('HR_PRIVATE_KEY')
    await addMember(hr, label)
    if (role) {
      await setMemberText(hr, label, 'org.role', role)
      await setMemberText(hr, label, 'org.since', /^\d{4}-\d{2}-\d{2}$/.test(since ?? '') ? since! : new Date().toISOString().slice(0, 10))
    }
    const inv = await store.createInvite(label)
    dropTeamCaches()
    return json({ ok: true, label, url: `https://t.me/${botUsername()}?start=${inv.token}` })
  } catch (e) {
    return json({ error: 'add_failed', message: (e as Error).message.slice(0, 200) }, 500)
  }
}
