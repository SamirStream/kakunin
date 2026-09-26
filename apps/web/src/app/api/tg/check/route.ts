import { checkIdentity } from '@kakunin/core'
import { isResponse, tgAuth } from '@/lib/tg'
import { getDirectory, json, org, reader, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

// POST { who } from inside Telegram: @username or numeric ID. Same engine as the public check; non-verified answers alert the org.
export async function POST(req: Request) {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const { who } = (await req.json().catch(() => ({}))) as { who?: string }
  const w = (who ?? '').trim().replace(/^@/, '')
  if (!w || w.length > 100) return json({ error: 'invalid_input' }, 400)
  const input = /^\d{5,}$/.test(w) ? { telegramId: w } : { username: w }
  const result = await checkIdentity(reader, input, await getDirectory())
  if (result.status !== 'verified')
    await store.addAlert({ org, kind: result.status, subject: input, detail: `${'username' in input ? '@' : ''}${w} (checked by Telegram user ${a.user.id})` })
  return json(result)
}
