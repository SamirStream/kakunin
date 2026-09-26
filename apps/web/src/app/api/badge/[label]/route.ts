import { limited } from '@/lib/guard'
import { LABEL_RE, getOrg, lookupMember } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Embeddable status badge (SVG) for a team member: <img src="https://kakunin.xyz/api/badge/alice">.
// It shows what Kakunin can prove about the LABEL. It does not prove the person messaging you is that member:
// check their Telegram ID against the profile page for that.
const COLORS = { ok: '#0f7a4a', warn: '#a15c00', bad: '#b3261e', mute: '#5d6572' } as const
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

function badge(right: string, color: string) {
  const left = 'kakunin'
  const lw = 62
  const rw = Math.max(70, right.length * 6.6 + 16)
  const w = lw + rw
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" role="img" aria-label="${esc(left)}: ${esc(right)}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="22" rx="4" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="22" fill="#1f2937"/><rect x="${lw}" width="${rw}" height="22" fill="${color}"/><rect width="${w}" height="22" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15">${esc(left)}</text><text x="${lw + rw / 2}" y="15">${esc(right)}</text></g></svg>`
}

export async function GET(req: Request, ctx: { params: Promise<{ label: string }> }) {
  const blocked = limited(req, 'badge', 120)
  if (blocked) return blocked
  const { label } = await ctx.params
  const l = decodeURIComponent(label).toLowerCase().replace(/\.svg$/, '')
  let text = 'unavailable'
  let color: string = COLORS.mute
  const oc = await getOrg(new URL(req.url).searchParams.get("org"))
  if (oc && LABEL_RE.test(l)) {
    try {
      const r = await lookupMember(oc, l)
      if (r.kind === 'checked' && r.result.status === 'verified') { text = `verified · ${oc.name}`; color = COLORS.ok }
      else if (r.kind === 'checked' && r.result.status === 'former') { text = 'former member'; color = COLORS.warn }
      else if (r.kind === 'unattested') { text = `team member · not attested`; color = COLORS.warn }
      else { text = 'not a member'; color = COLORS.bad }
    } catch { /* keep "unavailable" */ }
  } else { text = oc ? "invalid" : "unknown org"; color = COLORS.bad }
  return new Response(badge(text, color), { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60' } })
}
