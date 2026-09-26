// Tests a deployed Kakunin site end to end (read-only except the agent run) and says exactly what is missing.
//   pnpm cloud:check [https://kakunin-phi.vercel.app]
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })

const base = (process.argv[2] ?? process.env.PUBLIC_URL ?? 'https://kakunin-phi.vercel.app').replace(/\/$/, '')
let bad = 0
const line = (ok: boolean | null, name: string, extra = '') => { if (ok === false) bad++; console.log(`${ok === null ? ' -- ' : ok ? ' ok ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`) }
const get = (p: string) => fetch(base + p, { signal: AbortSignal.timeout(20000) })
const post = (p: string, body: object = {}, headers: Record<string, string> = {}) =>
  fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) })

console.log(`Kakunin cloud check: ${base}\n`)
for (const p of ['/', '/check', '/demo', '/org/kakunin-demo.eth']) line((await get(p)).status === 200, `page ${p}`)

const health = await get('/api/health').then((r) => (r.ok ? r.json() : null)).catch(() => null)
line(!!health, 'GET /api/health')
if (health) {
  console.log('\nConfiguration seen by the deployment:')
  console.log(JSON.stringify(health, null, 2).split('\n').map((l) => '   ' + l).join('\n'), '\n')
  line(health.store.startsWith('upstash'), 'persistent store (Upstash)', health.store.startsWith('upstash') ? '' : `-> currently "${health.store}": add the Upstash Redis integration in Vercel`)
  line(health.rpc === 'custom' ? true : null, 'custom Sepolia RPC', health.rpc === 'custom' ? '' : '(optional: set SEPOLIA_RPC_URL to an Alchemy URL)')
  line(health.telegram.token && health.telegram.webhookSecret && health.keys.org && health.keys.hr, 'Telegram env (token, webhook secret, ORG + HR keys)')
  line(!!health.telegram.webhookUrl && health.telegram.webhookUrl.startsWith(base), 'Telegram webhook points to this site', health.telegram.webhookUrl ? `(${health.telegram.webhookUrl})` : '-> run `pnpm webhook:set`')
  line(health.demoSigner.enabled && health.demoSigner.adminToken, 'demo signer enabled with an admin token')
  line(health.keys.agent && health.agent.intercepta, 'agent env (AGENT_PRIVATE_KEY + INTERCEPTA_API_KEY)')
}

console.log('\nFunctional checks:')
const c1 = await post('/api/check', { telegramId: '100000001' }).then((r) => r.json()).catch(() => null)
line(c1?.status === 'verified', 'check: Alice is verified (live ENSv2 read + attestation)', c1?.status ?? 'no answer')
const c2 = await post('/api/check', { username: 'alice_kakunn' }).then((r) => r.json()).catch(() => null)
line(c2?.status === 'lookalike', 'check: lookalike detected', c2?.status ?? 'no answer')
const inv = await post('/api/invite', { label: 'alice' })
line(inv.status === 401, 'invite without a signature is refused (401)', `got ${inv.status}`)
const paid = await get('/api/paid/real?telegramId=100000001')
line(paid.status === 402 && !!paid.headers.get('payment-required'), 'x402 seller answers 402 with payment requirements', `got ${paid.status}`)
const al = await get('/api/alerts').then((r) => r.json()).catch(() => null)
line(Array.isArray(al?.alerts), 'alerts feed readable', al ? `${al.alerts.length} alert(s)` : '')

const token = process.env.DEMO_ADMIN_TOKEN
const noTok = await post('/api/demo', { action: 'nope' })
line(noTok.status === 403, 'demo actions refuse callers without the token (403)', `got ${noTok.status}`)
if (token) {
  const withTok = await post('/api/demo', { action: 'nope' }, { 'x-demo-token': token })
  line(withTok.status === 400, 'demo actions accept the admin token', withTok.status === 403 ? '-> set DEMO_ADMIN_TOKEN + KAKUNIN_DEMO_SIGNER=1 in Vercel (same value as .env)' : `got ${withTok.status}`)
  if (process.argv.includes('--agent')) {
    const ag = await post('/api/agent', {}, { 'x-demo-token': token }).then((r) => r.json()).catch(() => null)
    const [a, b] = ag?.results ?? []
    line(a?.outcome === 'paid' && b?.outcome === 'blocked', 'agent: one payment approved, one blocked (live Intercepta + x402)', ag?.error ?? `${a?.outcome}/${b?.outcome}`)
  } else console.log('  --  agent run skipped (add --agent to spend 0.002 testnet USDC and 4 Intercepta calls)')
}
console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed.')
process.exit(bad ? 1 : 0)
