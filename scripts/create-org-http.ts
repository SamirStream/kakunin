// Creates an organisation through the PUBLIC HTTP API, exactly as the /create wizard does (validates the deployed provisioning path).
//   pnpm --filter @kakunin/scripts exec tsx create-org-http.ts <baseUrl> <label> <ownerAddress>
const [base = 'https://kakunin.xyz', label, owner] = process.argv.slice(2)
if (!label || !/^0x[0-9a-fA-F]{40}$/.test(owner ?? '')) { console.error('usage: create-org-http.ts <baseUrl> <label> <ownerAddress>'); process.exit(1) }
const t0 = Date.now()
const res = await fetch(`${base}/api/orgs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label, owner }) })
const start = await res.json()
if (!res.ok) { console.error('start failed', res.status, start); process.exit(1) }
console.log('job', start.id, start.name)
let p = start
while (p.status === 'running') {
  if (p.waitMs > 0) { console.log(`  waiting ${Math.ceil(p.waitMs / 1000)}s (commit-reveal)`); await new Promise((r) => setTimeout(r, p.waitMs + 500)) }
  const t = Date.now()
  p = await (await fetch(`${base}/api/orgs/jobs/${start.id}`, { method: 'POST' })).json()
  console.log(`[${p.index}/${p.total}] ${p.step} (${Math.round((Date.now() - t) / 1000)}s)${p.error ? '  ! ' + p.error : ''}`)
  if (p.error) await new Promise((r) => setTimeout(r, 3000))
}
console.log(`${p.status.toUpperCase()} in ${Math.round((Date.now() - t0) / 1000)}s; tighten error: ${p.tightenError ?? 'none'}`)
process.exit(p.status === 'done' ? 0 : 1)
