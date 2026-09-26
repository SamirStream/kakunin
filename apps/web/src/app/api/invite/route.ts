import { getMemberState } from '@kakunin/core'
import { botUsername, json, pub, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { label } -> one-time Telegram deep link. The member must already be registered on-chain (by HR).
export async function POST(req: Request) {
  const { label } = (await req.json().catch(() => ({}))) as { label?: string }
  if (!label || !/^[a-z0-9-]{1,32}$/.test(label)) return json({ error: 'invalid label' }, 400)
  if ((await getMemberState(pub, label)).status !== 'REGISTERED') return json({ error: `${label} is not an active member` }, 409)
  const inv = store.createInvite(label)
  return json({ token: inv.token, url: `https://t.me/${botUsername()}?start=${inv.token}` })
}
