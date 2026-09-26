import { isNameAvailable, parseOrgLabel } from '@kakunin/core/provision'
import { limited } from '@/lib/guard'
import { json, pub, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

// GET ?label=acme: can this ENS name be created right now? Reads ENSv2 (the source of truth); never spends anything.
export async function GET(req: Request) {
  const blocked = limited(req, 'org-available', 60)
  if (blocked) return blocked
  const p = parseOrgLabel(new URL(req.url).searchParams.get('label') ?? '')
  if (!p.ok) return json({ ok: false, reason: p.reason })
  if (await store.getOrg(p.name)) return json({ ok: false, name: p.name, reason: `${p.name} is already on Kakunin.` })
  const free = await isNameAvailable(pub, p.label).catch(() => null)
  if (free === null) return json({ ok: false, name: p.name, reason: 'Could not reach ENS right now. Try again.' })
  return json(free ? { ok: true, name: p.name } : { ok: false, name: p.name, reason: `${p.name} is already registered on ENSv2 Sepolia.` })
}
