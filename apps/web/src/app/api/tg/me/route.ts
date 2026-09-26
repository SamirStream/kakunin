import { checkIdentity } from '@kakunin/core'
import { displayName, isResponse, isTgAdmin, tgAuth } from '@/lib/tg'
import { getDirectory, json, reader } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Who is opening the Mini App? The Telegram account is authenticated by initData, so "my card" cannot be requested for someone else.
export async function POST(req: Request) {
  const a = await tgAuth(req)
  if (isResponse(a)) return a
  const [admin, dir] = await Promise.all([isTgAdmin(a.user.id), getDirectory()])
  // By numeric ID only: the ID is the identity, the @username is not.
  const result = await checkIdentity(reader, { telegramId: String(a.user.id) }, dir)
  return json({
    user: { id: a.user.id, name: displayName(a.user) ?? a.user.username ?? 'You', username: a.user.username ?? null, photo: a.user.photo_url ?? null },
    admin,
    startParam: a.startParam ?? null,
    result,
  })
}
