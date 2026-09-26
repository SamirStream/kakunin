// End-to-end check of the multi-organisation admin API against a running web app (local or cloud), signing exactly like the dashboard.
//   pnpm --filter @kakunin/scripts exec tsx e2e-http.ts <baseUrl> <org.eth>
// The owner wallet of <org> must be the HR_PRIVATE_KEY in .env (true for orgs created with `pnpm provision <label> <HR address>`).
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { actionMessage, type DashboardAction } from '@kakunin/core/auth'
import { signInitData } from '@kakunin/core/telegram'

const [base = 'http://127.0.0.1:3000', org = 'kk-e2e-02.eth'] = process.argv.slice(2)
const owner = privateKeyToAccount(process.env.HR_PRIVATE_KEY as `0x${string}`)
const stranger = privateKeyToAccount(generatePrivateKey())
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1 }

async function call(who: typeof owner, action: DashboardAction, target: string, path: string, body: object) {
  const issued = Date.now()
  const sig = await who.signMessage({ message: actionMessage(org, action, target, issued) })
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kk-issued': String(issued), 'x-kk-sig': sig }, body: JSON.stringify(body) })
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}
const check = (input: object) => fetch(base + '/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ org, ...input }) }).then((r) => r.json() as Promise<{ status: string }>)

const label = 'zed' + Math.floor(Math.random() * 900 + 100)
const tgId = String(700000000 + Math.floor(Math.random() * 99999999))

let r = await call(stranger, 'add-member', label, `/api/orgs/${org}/members`, { action: 'add', label, role: 'Tester' })
ok(r.status === 403, `a stranger's signature is refused (${r.status})`)
r = await call(owner, 'revoke-member', label, `/api/orgs/${org}/members`, { action: 'add', label, role: 'Tester' })
ok(r.status === 403, `a signature for another action is refused (${r.status})`)
const alerts = await fetch(`${base}/api/alerts?org=${org}`)
ok(alerts.status === 401, `private alerts need a signature (${alerts.status})`)

r = await call(owner, 'add-member', label, `/api/orgs/${org}/members`, { action: 'add', label, role: 'Tester' })
ok(r.status === 200 && typeof r.data.url === 'string', `owner adds ${label} (${r.status}) invite ${String(r.data.url ?? r.data.message).slice(0, 60)}`)
const members = (await (await fetch(`${base}/api/members?org=${org}&fresh=1`)).json()) as { members: { label: string; status: string }[] }
ok(members.members.some((m) => m.label === label && m.status === 'active'), `${label} is active on the team registry`)
ok((await check({ username: label })).status !== 'verified', 'not verified before Telegram onboarding')
r = await call(owner, 'revoke-member', label, `/api/orgs/${org}/members`, { action: 'revoke', label })
ok(r.status === 200, `owner revokes ${label} (${r.status})`)
const after = (await (await fetch(`${base}/api/members?org=${org}&fresh=1`)).json()) as { members: { label: string; status: string }[] }
ok(after.members.some((m) => m.label === label && m.status === 'former'), `${label} is now a former member`)

// ---- Telegram: admin link, member onboarding (real attestation on-chain), Mini App views ----
const token = process.env.TELEGRAM_BOT_TOKEN!
const initFor = (id: number, first: string) => signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: first, username: first.toLowerCase() + '_e2e' }) }, token)
const tg = async (path: string, id: number, first: string, body: object = {}) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tg-init': initFor(id, first) }, body: JSON.stringify(body) })
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, any> }
}
const tokenOf = (url: unknown) => String(url).split('start=')[1]
const adminId = 910000000 + Math.floor(Math.random() * 99999), memberId = 920000000 + Math.floor(Math.random() * 99999)

const adm = await call(owner, 'telegram-admin', '', `/api/orgs/${org}/telegram`, {})
ok(adm.status === 200, 'owner mints a Telegram admin link')
let t = await tg('/api/tg/admin', adminId, 'Boss', { org })
ok(t.status === 403, `a Telegram account that is not admin is refused (${t.status})`)
t = await tg('/api/tg/invite', adminId, 'Boss', { token: tokenOf(adm.data.url) })
ok(t.data.kind === 'admin' && t.data.org === org, 'admin invite is recognised')
t = await tg('/api/tg/onboard', adminId, 'Boss', { token: tokenOf(adm.data.url) })
ok(t.data.admin === true, 'the account becomes an admin of the organisation')
t = await tg('/api/tg/onboard', adminId, 'Boss', { token: tokenOf(adm.data.url) })
ok(t.status === 404, 'the admin link is single use')
t = await tg('/api/tg/me', adminId, 'Boss')
ok(Array.isArray(t.data.adminOf) && t.data.adminOf.includes(org), 'Mini App: /me lists the organisation as administered')
t = await tg('/api/tg/admin', adminId, 'Boss', { org })
ok(t.status === 200 && t.data.org === org, 'Mini App: team console loads for that organisation')
t = await tg('/api/tg/admin', adminId, 'Boss', { org: 'kakunin-demo.eth' })
ok(t.status === 403, 'an admin of one organisation cannot open another one')

const l2 = 'kai' + Math.floor(Math.random() * 900 + 100)
const add2 = await call(owner, 'add-member', l2, `/api/orgs/${org}/members`, { action: 'add', label: l2, role: 'Engineer' })
ok(add2.status === 200, `owner adds ${l2}`)
const t0 = Date.now()
t = await tg('/api/tg/onboard', memberId, 'Kai', { token: tokenOf(add2.data.url) })
ok(t.data.ok === true && t.data.org === org, `member opens the invite from their own Telegram: attested on-chain in ${Math.round((Date.now() - t0) / 1000)}s`)
const v = await check({ telegramId: String(memberId) }) as { status: string; member?: { label: string } }
ok(v.status === 'verified' && v.member?.label === l2, 'the web check now answers VERIFIED for that Telegram ID')
t = await tg('/api/tg/me', memberId, 'Kai')
ok(t.data.result?.status === 'verified' && t.data.result?.org === org, 'Mini App: My card is verified for that organisation')
t = await tg('/api/tg/check', adminId, 'Boss', { who: String(memberId) })
ok(t.data.status === 'verified', 'Mini App: checking that ID across all organisations finds it')
t = await tg('/api/tg/check', adminId, 'Boss', { who: '@kai_impostor_x', org })
ok(t.data.status !== 'verified', `an unrelated handle is not verified (${t.data.status})`)
const feed = await fetch(`${base}/api/alerts?org=${org}`, { headers: await (async () => { const i = Date.now(); return { 'x-kk-issued': String(i), 'x-kk-sig': await owner.signMessage({ message: actionMessage(org, 'session', '', i) }) } })() })
const fd = (await feed.json()) as { alerts: { detail: string }[]; telegramAdmins: number }
ok(feed.status === 200 && fd.telegramAdmins >= 1 && fd.alerts.length >= 1, `the owner sees the private alert feed (${fd.alerts?.length} alerts, ${fd.telegramAdmins} Telegram admin)`)
// ---- Reports: an impersonator, and a compromised official account ----
const report = (body: object) => fetch(base + '/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ org, ...body }) }).then(async (r) => ({ status: r.status, data: (await r.json()) as Record<string, any> }))
const session = async () => { const i = Date.now(); return { 'x-kk-issued': String(i), 'x-kk-sig': await owner.signMessage({ message: actionMessage(org, 'session', '', i) }) } }
const fake = 'impostor_' + Math.floor(Math.random() * 90000 + 10000)

let rp = await report({ username: fake, note: 'pretends to be HR, asks to run a repo' })
ok(rp.status === 200 && rp.data.count === 1, 'anyone can report an impersonator (queued, nothing public yet)')
rp = await report({ username: fake })
ok(rp.status === 200 && rp.data.count === 2, 'a second report of the same account is merged')
ok((await check({ username: fake })).status !== 'lookalike' || !(await check({ username: fake }) as any).confirmed, 'a pending report changes nothing public')
rp = await report({ telegramId: String(memberId) })
ok(rp.status === 409, `a verified member cannot be reported as an impersonator (${rp.status})`)
rp = await report({ kind: 'compromised', username: 'random_nobody_x1' })
ok(rp.status === 409, `only a verified member can be reported as compromised (${rp.status})`)
ok((await fetch(`${base}/api/orgs/${org}/reports`)).status === 401, 'the report queue needs an admin signature')

const q = (await (await fetch(`${base}/api/orgs/${org}/reports`, { headers: await session() })).json()) as { reports: { id: string; subject: { username?: string }; status: string; count: number }[] }
const mine = q.reports.find((x) => x.subject.username === fake)
ok(!!mine && mine.status === 'pending' && mine.count === 2, 'the owner sees the pending report with its count')
const bad = await call(stranger, 'confirm-report', mine!.id, `/api/orgs/${org}/reports`, { id: mine!.id, decision: 'confirm' })
ok(bad.status === 403, `a stranger cannot confirm a report (${bad.status})`)
const wrong = await call(owner, 'dismiss-report', mine!.id, `/api/orgs/${org}/reports`, { id: mine!.id, decision: 'confirm' })
ok(wrong.status === 403, `a signature for another decision is refused (${wrong.status})`)
const conf = await call(owner, 'confirm-report', mine!.id, `/api/orgs/${org}/reports`, { id: mine!.id, decision: 'confirm' })
ok(conf.status === 200, 'the owner confirms the impersonator')
const pub = (await check({ username: fake })) as { status: string; confirmed?: { note?: string } }
ok(pub.status === 'lookalike' && !!pub.confirmed && /HR/.test(pub.confirmed.note ?? ''), 'every check now says: reported impersonator, with the note')
const tgc = await tg('/api/tg/check', adminId, 'Boss', { who: '@' + fake, org })
ok(tgc.data.status === 'lookalike' && !!tgc.data.confirmed, 'the Mini App and the bot engine say so too')
const retract = await call(owner, 'dismiss-report', mine!.id, `/api/orgs/${org}/reports`, { id: mine!.id, decision: 'dismiss' })
ok(retract.status === 200 && (await check({ username: fake }) as any).confirmed === undefined, 'a confirmed report can be retracted')

rp = await report({ kind: 'compromised', telegramId: String(memberId), note: 'posting airdrop links' })
ok(rp.status === 200, `anyone can report an official account as compromised (${rp.status})`)
const cm = await call(owner, 'mark-compromised', l2, `/api/orgs/${org}/members`, { action: 'compromised', label: l2 })
ok(cm.status === 200 && cm.data.compromised === true, 'the owner marks the member compromised (record on-chain, then revoked)')
const cres = (await check({ telegramId: String(memberId) })) as { status: string; compromised?: boolean }
ok(cres.status === 'former' && cres.compromised === true, 'every check now says: compromised account')
const q2 = (await (await fetch(`${base}/api/orgs/${org}/reports`, { headers: await session() })).json()) as { reports: { kind: string; status: string }[] }
ok(q2.reports.some((x) => x.kind === 'compromised' && x.status === 'confirmed'), 'the pending compromised report was settled automatically')
const mem = (await (await fetch(`${base}/api/members?org=${org}&fresh=1`)).json()) as { members: { label: string; compromised?: boolean }[] }
ok(mem.members.find((m) => m.label === l2)?.compromised === true, 'the dashboard data flags the member as compromised')
void tgId
console.log(process.exitCode ? '\nFAILED' : '\nAll checks passed')
