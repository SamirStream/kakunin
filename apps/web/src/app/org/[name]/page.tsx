'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DEPLOYMENT, addMember, revokeMember, setMemberText, ABIS, HR_REGISTRY_ROLES, type TxCtx } from '@kakunin/core/ens'
import { inviteMessage } from '@kakunin/core/auth'
import { connectWallet } from '@/lib/wallet'

interface Member { label: string; fqn: string; status: 'active' | 'former'; role: string | null; since: string | null; registeredAt: number; revokedAt?: number; telegramId: string | null; username: string | null }
interface Delegation {
  hr: string; org: string
  teamRegistry: { name: string; register: boolean; unregister: boolean; renew: boolean; setResolver: boolean }
  orgRegistry: { name: string; register: boolean; unregister: boolean; setResolver: boolean }
  teamResolver: { setText: boolean }; orgResolver: { setText: boolean }
}
interface Alert { id: string; at: number; kind: string; detail: string; org: string }

const day = (u?: number) => (u ? new Date(u * 1000).toISOString().slice(0, 10) : '—')
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

function Perm({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><span className={`pill ${ok ? 'pill-ok' : 'pill-bad'}`}>{ok ? 'allowed' : 'denied'}</span></li>
}

export default function OrgPage() {
  const params = useParams<{ name: string }>()
  const name = decodeURIComponent(params.name)
  const [members, setMembers] = useState<Member[]>([])
  const [deleg, setDeleg] = useState<Delegation | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [ctx, setCtx] = useState<(TxCtx & { address: string }) | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ label: string; url: string } | null>(null)
  const [form, setForm] = useState({ label: '', role: '', since: new Date().toISOString().slice(0, 10) })

  const log = useCallback((m: string) => setLogs((l) => [...l.slice(-30), m]), [])
  const refresh = useCallback(async (fresh = false) => {
    const [m, a] = await Promise.all([
      fetch(`/api/members${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/alerts', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ])
    if (m) setMembers(m.members)
    if (a) setAlerts(a.alerts)
  }, [])
  useEffect(() => { refresh(); const t = setInterval(() => refresh(), 4000); return () => clearInterval(t) }, [refresh])
  useEffect(() => { fetch('/api/delegation', { cache: 'no-store' }).then((r) => r.json()).then(setDeleg).catch(() => {}) }, [])

  if (name.toLowerCase() !== DEPLOYMENT.orgName)
    return <div className="card p-6">No team registry published for <span className="mono">{name}</span> on Kakunin (demo org: <a className="underline" href={`/org/${DEPLOYMENT.orgName}`}>{DEPLOYMENT.orgName}</a>).</div>

  const role = ctx ? (ctx.address.toLowerCase() === DEPLOYMENT.hrWallet.toLowerCase() ? 'HR wallet' : ctx.address.toLowerCase() === DEPLOYMENT.orgWallet.toLowerCase() ? 'Org wallet' : 'no role on this registry') : null

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key); setErr(null)
    try { await fn(); await refresh(true) } catch (e) { setErr((e as Error).message.split('\n')[0]) } finally { setBusy(null) }
  }
  const connect = () => run('connect', async () => setCtx(await connectWallet(log)))
  const add = () => run('add', async () => {
    if (!ctx) throw new Error('Connect the HR wallet first')
    const label = form.label.trim().toLowerCase()
    if (!/^[a-z0-9-]{1,32}$/.test(label)) throw new Error('Label: a-z, 0-9, dash')
    await addMember(ctx, label)
    await setMemberText(ctx, label, 'org.role', form.role || 'Member')
    await setMemberText(ctx, label, 'org.since', form.since)
    setInvite({ label, url: (await requestInvite(label)).url })
    setForm((f) => ({ ...f, label: '', role: '' }))
  })
  const revoke = (label: string) => run(`rev-${label}`, async () => {
    if (!ctx) throw new Error('Connect the HR wallet first')
    await revokeMember(ctx, label)
  })
  // An invite lets its holder bind THEIR Telegram ID to the member subname, so the API only issues it against a fresh
  // signature from the HR/ORG wallet (see packages/core/src/auth.ts).
  async function requestInvite(label: string): Promise<{ url: string }> {
    if (!ctx) throw new Error('Connect the HR or ORG wallet to create invites')
    const issuedAt = Date.now()
    const signature = await ctx.wallet.signMessage({ account: ctx.account, message: inviteMessage(DEPLOYMENT.orgName, label, issuedAt) })
    const inv = await fetch('/api/invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label, issuedAt, signature }) }).then((r) => r.json())
    if (inv.error) throw new Error(inv.error)
    return inv
  }
  const makeInvite = (label: string) => run(`inv-${label}`, async () => setInvite({ label, url: (await requestInvite(label)).url }))
  const grantHr = (grant: boolean) => run('deleg', async () => {
    if (!ctx) throw new Error('Connect the ORG wallet first')
    const req = { address: DEPLOYMENT.teamRegistry, abi: ABIS.registry, functionName: grant ? 'grantRootRoles' : 'revokeRootRoles', args: [HR_REGISTRY_ROLES, DEPLOYMENT.hrWallet] as const }
    log(`${grant ? 'granting' : 'revoking'} HR roles on the team registry…`)
    await ctx.pub.simulateContract({ ...req, account: ctx.account } as any)
    const hash = await ctx.wallet.writeContract({ ...req, account: ctx.account, chain: ctx.wallet.chain } as any)
    await ctx.pub.waitForTransactionReceipt({ hash })
    setDeleg(await fetch('/api/delegation', { cache: 'no-store' }).then((r) => r.json()))
  })

  const active = members.filter((m) => m.status === 'active')
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="pill pill-info w-fit">Org dashboard</p>
          <h1 className="mt-2 text-3xl font-extrabold">{DEPLOYMENT.orgName}</h1>
          <p className="mono mt-1 break-all" style={{ color: 'var(--muted)' }}>team registry {DEPLOYMENT.teamName} · {short(DEPLOYMENT.teamRegistry)}</p>
        </div>
        <div className="flex items-center gap-2">
          {ctx ? <span className={`pill ${role === 'no role on this registry' ? 'pill-warn' : 'pill-ok'}`}>{short(ctx.address)} · {role}</span>
            : <button className="btn btn-primary" onClick={connect} disabled={busy === 'connect'}>{busy === 'connect' ? 'Connecting…' : 'Connect wallet'}</button>}
        </div>
      </div>
      {err && <p className="pill pill-bad max-w-full whitespace-normal break-words">{err}</p>}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3"><h2 className="font-bold">Team ({active.length} active)</h2><span className="text-xs" style={{ color: 'var(--muted)' }}>live from ENSv2 · refreshes every 4s</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead style={{ color: 'var(--muted)' }}><tr className="border-t" style={{ borderColor: 'var(--line)' }}>
              <th className="px-5 py-2 font-medium">Member</th><th className="px-3 py-2 font-medium">Role</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Telegram</th><th className="px-5 py-2 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {members.length === 0 && <tr><td className="px-5 py-4" style={{ color: 'var(--muted)' }} colSpan={5}>No members yet.</td></tr>}
              {members.map((m) => (
                <tr key={m.label} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-5 py-3"><div className="font-semibold">{m.label}</div><div className="mono break-all" style={{ color: 'var(--muted)' }}>{m.fqn}</div></td>
                  <td className="px-3 py-3">{m.role ?? '—'}<div className="text-xs" style={{ color: 'var(--muted)' }}>{m.since ? `since ${m.since}` : ''}</div></td>
                  <td className="px-3 py-3">{m.status === 'active' ? <span className="pill pill-ok">active</span> : <span className="pill pill-warn">former · revoked {day(m.revokedAt)}</span>}</td>
                  <td className="px-3 py-3 mono">{m.username ? `@${m.username}` : '—'}<div style={{ color: 'var(--muted)' }}>{m.telegramId ?? 'not onboarded'}</div></td>
                  <td className="px-5 py-3 text-right">
                    {m.status === 'active' && (
                      <div className="flex justify-end gap-2">
                        <button className="btn" onClick={() => makeInvite(m.label)} disabled={busy !== null || !ctx} title={ctx ? 'Sign with the HR/ORG wallet to create a one-time link' : 'Connect the HR wallet first'}>Invite link</button>
                        <button className="btn btn-danger" onClick={() => revoke(m.label)} disabled={busy !== null || !ctx}>{busy === `rev-${m.label}` ? 'Revoking…' : 'Revoke'}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {invite && (
        <section className="pop card space-y-2 p-5">
          <div className="font-semibold">One-time Telegram link for {invite.label}</div>
          <p className="mono break-all rounded-lg p-3" style={{ background: 'var(--info-bg)' }}>{invite.url}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Send it to the member. Opening it from their own Telegram binds their numeric ID and writes the attestation on ENS. Single use.</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Add member</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Registers <span className="mono">label.{DEPLOYMENT.teamName}</span> (org-owned) with the HR wallet, sets role and start date, then creates the invite link.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className="input" placeholder="label (carol)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} autoCapitalize="none" />
            <input className="input" placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            <input className="input" type="date" value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={add} disabled={busy !== null || !ctx || !form.label}>{busy === 'add' ? 'Sending transactions…' : ctx ? 'Add member (3 txs)' : 'Connect the HR wallet to add'}</button>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">HR delegation (Enhanced Access Control)</h2>
          {!deleg ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Reading roles…</p> : (
            <>
              <p className="mono break-all text-xs" style={{ color: 'var(--muted)' }}>HR {deleg.hr}</p>
              <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>On {deleg.teamRegistry.name}</div>
                <ul className="space-y-1"><Perm ok={deleg.teamRegistry.register} label="Register members" /><Perm ok={deleg.teamRegistry.unregister} label="Revoke members" /><Perm ok={deleg.teamRegistry.renew} label="Renew" /><Perm ok={deleg.teamRegistry.setResolver} label="Change resolver" /><Perm ok={deleg.teamResolver.setText} label="Edit member records" /></ul></div>
              <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>On {deleg.orgRegistry.name} (root)</div>
                <ul className="space-y-1"><Perm ok={deleg.orgRegistry.register} label="Register subnames" /><Perm ok={deleg.orgRegistry.unregister} label="Unregister “team”" /><Perm ok={deleg.orgRegistry.setResolver} label="Change resolver" /><Perm ok={deleg.orgResolver.setText} label="Edit org records" /></ul></div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn" disabled={busy !== null || !ctx} onClick={() => grantHr(true)}>Grant HR roles</button>
                <button className="btn btn-danger" disabled={busy !== null || !ctx} onClick={() => grantHr(false)}>Revoke HR roles</button>
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Grant / revoke need the org wallet. HR can run the team but can never touch the org’s root name.</p>
            </>
          )}
        </section>
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Impersonation alerts</h2>
        {alerts.length === 0 ? <p className="text-sm" style={{ color: 'var(--muted)' }}>No one has tried to impersonate {DEPLOYMENT.orgName} yet.</p> : (
          <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {alerts.slice(0, 10).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
                <span><span className={`pill ${a.kind === 'former' ? 'pill-warn' : a.kind === 'lookalike' ? 'pill-bad' : 'pill-info'}`}>{a.kind}</span> <span className="mono">{a.detail}</span></span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{new Date(a.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {logs.length > 0 && <pre className="card mono max-h-48 overflow-auto whitespace-pre-wrap p-4 text-xs">{logs.join('\n')}</pre>}
    </div>
  )
}
