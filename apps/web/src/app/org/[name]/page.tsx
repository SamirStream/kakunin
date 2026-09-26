'use client'
// Organisation dashboard. Reads are public (the team is public on ENSv2). Everything that changes something requires the
// organisation owner's wallet SIGNATURE (no gas, no network switch): the server then acts with the organisation's operator key.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { Hex } from 'viem'
import { ABIS, HR_REGISTRY_ROLES, type TxCtx } from '@kakunin/core/ens'
import { actionMessage, type DashboardAction } from '@kakunin/core/auth'
import { CopyButton } from '@/components/CopyButton'
import { InviteQR } from '@/components/InviteQR'
import { OrgInsights } from '@/components/OrgInsights'
import { connectAccount, connectWallet, type Signer } from '@/lib/wallet'

interface Member { label: string; fqn: string; status: 'active' | 'former'; role: string | null; since: string | null; registeredAt: number; revokedAt?: number; telegramId: string | null; username: string | null }
interface Info { org: string; team: string; owner: string; operator: string | null; demo: boolean; teamRegistry: string; createdAt: number | null; members: Member[] }
interface Delegation {
  hr: string; org: string; selfServe: boolean; ownerControlsRoot: boolean
  teamRegistry: { address: string; name: string; register: boolean; unregister: boolean; renew: boolean; setResolver: boolean }
  orgRegistry: { name: string; register: boolean; unregister: boolean; setResolver: boolean }
  teamResolver: { setText: boolean }; orgResolver: { setText: boolean }
}
interface Alert { id: string; at: number; kind: string; detail: string; org: string }
interface Session { issuedAt: number; signature: Hex; address: string }

const day = (u?: number) => (u ? new Date(u * 1000).toISOString().slice(0, 10) : '—')
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const SESSION_MS = 55 * 60 * 1000

function Perm({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><span className={`pill ${ok ? 'pill-ok' : 'pill-bad'}`}>{ok ? 'allowed' : 'denied'}</span></li>
}

export default function OrgPage() {
  const params = useParams<{ name: string }>()
  const name = decodeURIComponent(params.name).toLowerCase()
  const [info, setInfo] = useState<Info | null>(null)
  const [missing, setMissing] = useState(false)
  const [deleg, setDeleg] = useState<Delegation | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [tgAdmins, setTgAdmins] = useState(0)
  const [session, setSession] = useState<Session | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [invite, setInvite] = useState<{ title: string; url: string; note: string } | null>(null)
  const [form, setForm] = useState({ label: '', role: '', since: new Date().toISOString().slice(0, 10) })
  const members = info?.members ?? []
  const log = useCallback((m: string) => setLogs((l) => [...l.slice(-30), m]), [])

  const authHeaders = (s: Session) => ({ 'x-kk-issued': String(s.issuedAt), 'x-kk-sig': s.signature })

  // Restore a still-valid sign-in for this tab.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`kk-session:${name}`)
      const s = raw ? (JSON.parse(raw) as Session) : null
      if (s && Date.now() - s.issuedAt < SESSION_MS) setSession(s)
    } catch { /* ignore */ }
  }, [name])

  const refresh = useCallback(async (fresh = false) => {
    const r = await fetch(`/api/members?org=${encodeURIComponent(name)}${fresh ? '&fresh=1' : ''}`, { cache: 'no-store', headers: session ? authHeaders(session) : undefined }).catch(() => null)
    if (r?.status === 404) return setMissing(true)
    if (r?.ok) setInfo(await r.json())
    const a = await fetch(`/api/alerts?org=${encodeURIComponent(name)}`, { cache: 'no-store', headers: session ? authHeaders(session) : undefined }).catch(() => null)
    if (a?.ok) { const d = await a.json(); setAlerts(d.alerts); setTgAdmins(d.telegramAdmins) } else if (a?.status === 403 || a?.status === 401) { setAlerts([]); if (session) setSession(null) }
  }, [name, session])
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t) }, [refresh])
  useEffect(() => { fetch(`/api/delegation?org=${encodeURIComponent(name)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setDeleg(d)).catch(() => {}) }, [name])

  const admins = useMemo(() => [info?.owner, info?.demo ? deleg?.hr : null].filter(Boolean).map((a) => a!.toLowerCase()), [info, deleg])
  const isAdmin = !!session && admins.includes(session.address.toLowerCase())

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key); setErr(null)
    try { await fn(); await refresh(true) } catch (e) { setErr((e as Error).message.split('\n')[0]) } finally { setBusy(null) }
  }
  const getSigner = async (): Promise<Signer> => connectAccount()
  const signIn = () => run('signin', async () => {
    const signer = await getSigner()
    const issuedAt = Date.now()
    const signature = await signer.sign(actionMessage(name, 'session', '', issuedAt))
    const s = { issuedAt, signature, address: signer.address }
    setSession(s)
    try { sessionStorage.setItem(`kk-session:${name}`, JSON.stringify(s)) } catch { /* ignore */ }
  })
  /** One fresh wallet signature per state-changing action (naming the exact target), then a server call. */
  async function signedCall<T>(action: DashboardAction, target: string, path: string, body: object): Promise<T> {
    const signer = await getSigner()
    const issuedAt = Date.now()
    const signature = await signer.sign(actionMessage(name, action, target, issuedAt))
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kk-issued': String(issuedAt), 'x-kk-sig': signature }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message ?? data.error ?? `request failed (${res.status})`)
    return data as T
  }

  const add = () => run('add', async () => {
    const label = form.label.trim().toLowerCase()
    if (!/^[a-z0-9-]{1,32}$/.test(label)) throw new Error('Label: a-z, 0-9, dash')
    const r = await signedCall<{ url: string }>('add-member', label, `/api/orgs/${name}/members`, { action: 'add', label, role: form.role || 'Member', since: form.since })
    setInvite({ title: `One-time Telegram link for ${label}`, url: r.url, note: 'Opening it from their own Telegram binds their numeric ID and writes the attestation on ENS. Single use, valid for 7 days.' })
    setForm((f) => ({ ...f, label: '', role: '' }))
  })
  const revoke = (label: string) => run(`rev-${label}`, async () => { await signedCall('revoke-member', label, `/api/orgs/${name}/members`, { action: 'revoke', label }) })
  const makeInvite = (label: string) => run(`inv-${label}`, async () => {
    const r = await signedCall<{ url: string }>('invite', label, '/api/invite', { org: name, label })
    setInvite({ title: `One-time Telegram link for ${label}`, url: r.url, note: 'Opening it from their own Telegram binds their numeric ID and writes the attestation on ENS. Single use, valid for 7 days.' })
  })
  const connectTelegram = () => run('tg', async () => {
    const r = await signedCall<{ url: string }>('telegram-admin', '', `/api/orgs/${name}/telegram`, {})
    setInvite({ title: 'Get impersonation alerts in Telegram', url: r.url, note: 'Open it in Telegram from the account that should receive alerts. It also unlocks the team console in the Mini App. Single use.' })
  })
  // The owner's own on-chain power (their wallet pays gas): take the delegated account's roles away, or give them back.
  const grantHr = (grant: boolean) => run('deleg', async () => {
    if (!deleg) return
    const ctx: TxCtx = await connectWallet(log)
    const req = { address: deleg.teamRegistry.address, abi: ABIS.registry, functionName: grant ? 'grantRootRoles' : 'revokeRootRoles', args: [HR_REGISTRY_ROLES, deleg.hr] as const }
    log(`${grant ? 'granting' : 'revoking'} the delegated account's roles on the team registry…`)
    await ctx.pub.simulateContract({ ...req, account: ctx.account } as never)
    const hash = await ctx.wallet.writeContract({ ...req, account: ctx.account, chain: ctx.wallet.chain } as never)
    await ctx.pub.waitForTransactionReceipt({ hash })
    log(`done: ${hash}`)
    setDeleg(await fetch(`/api/delegation?org=${encodeURIComponent(name)}`, { cache: 'no-store' }).then((r) => r.json()))
  })
  const exportCsv = () => {
    const rows = [['label', 'ens_name', 'status', 'role', 'since', 'telegram_id', 'revoked'], ...members.map((m) => [m.label, m.fqn, m.status, m.role ?? '', m.since ?? '', m.telegramId ?? '', m.revokedAt ? day(m.revokedAt) : ''])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `${name}-team.csv` })
    a.click(); URL.revokeObjectURL(a.href)
  }

  if (missing) return <div className="card mx-auto max-w-xl space-y-3 p-6"><h1 className="t-h2 !text-3xl">Unknown organisation</h1><p style={{ color: 'var(--muted)' }}>Kakunin does not publish a team for <span className="mono">{name}</span> yet.</p><div className="flex gap-2"><Link className="btn btn-primary" href="/create">Create it</Link><Link className="btn" href="/org/kakunin-demo.eth">Open the sample org</Link></div></div>
  if (!info) return <div className="space-y-4" aria-busy><div className="h-10 w-72 animate-pulse rounded-lg" style={{ background: 'var(--info-bg)' }} /><div className="h-64 animate-pulse rounded-xl" style={{ background: 'var(--info-bg)' }} /></div>

  const active = members.filter((m) => m.status === 'active')
  const selfServe = !info.demo
  const who = session ? (isAdmin ? (info.demo && session.address.toLowerCase() === deleg?.hr?.toLowerCase() ? 'HR wallet' : 'Owner') : 'Not an admin of this org') : null
  const checkUrl = `https://kakunin.xyz/check?org=${name}`
  const steps = [
    { done: active.length > 0, title: 'Add your first member', text: 'Enter a name and role below. Kakunin registers them on your team registry and prepares their Telegram link.' },
    { done: members.some((m) => m.telegramId), title: 'Have them verify on Telegram', text: 'They open the one-time link from their own account. Their numeric ID is attested on ENS.' },
    { done: tgAdmins > 0, title: 'Connect Telegram alerts', text: 'Get a message the moment someone checks a lookalike of your team.' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-h2 break-all">{info.org}</h1>
          <p className="mono mt-1 break-all" style={{ color: 'var(--muted)' }}>team registry {info.team} · {short(info.teamRegistry)} · owner {short(info.owner)}{selfServe && info.createdAt ? ` · created ${new Date(info.createdAt).toISOString().slice(0, 10)}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {session ? <span className={`pill ${isAdmin ? 'pill-ok' : 'pill-warn'}`}>{short(session.address)} · {who}</span>
            : <button className="btn btn-primary" onClick={signIn} disabled={busy === 'signin'}>{busy === 'signin' ? 'Waiting for signature…' : 'Sign in with wallet'}</button>}
        </div>
      </div>
      {err && <p className="pill pill-bad max-w-full whitespace-normal break-words" role="alert">{err}</p>}
      {!isAdmin && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {session ? 'This wallet does not administer this organisation, so the dashboard is read-only.' : selfServe ? 'Sign in with the owner wallet to add members, revoke access and see private alerts. Signing costs no gas.' : 'This is the sample organisation. Everything below is real ENSv2 data on Sepolia; admin actions need its owner or HR wallet.'}
          {' '}<Link className="underline" href="/create">Create your own organisation</Link>.
        </p>
      )}

      {selfServe && isAdmin && active.length === 0 && (
        <section className="card p-5" aria-label="Getting started">
          <h2 className="font-bold">Getting started</h2>
          <ol className="mt-3 grid gap-3 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3 text-sm"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? 'pill-ok' : 'pill-info'}`} aria-hidden>{s.done ? '✓' : i + 1}</span><div><div className="font-semibold">{s.title}</div><p style={{ color: 'var(--muted)' }}>{s.text}</p></div></li>
            ))}
          </ol>
        </section>
      )}

      <OrgInsights members={members} alerts={alerts} />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <h2 className="font-bold">Team ({active.length} active)</h2>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
            live from ENSv2 · refreshes every 5s
            <button className="btn !px-3 !py-1 !text-xs" onClick={exportCsv} disabled={!members.length}>Export CSV</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead style={{ color: 'var(--muted)' }}><tr className="border-t" style={{ borderColor: 'var(--line)' }}>
              <th className="px-5 py-2 font-medium">Member</th><th className="px-3 py-2 font-medium">Role</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Telegram</th><th className="px-5 py-2 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {members.length === 0 && <tr><td className="px-5 py-4" style={{ color: 'var(--muted)' }} colSpan={5}>No members yet.</td></tr>}
              {members.map((m) => (
                <tr key={m.label} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-5 py-3"><Link className="font-semibold underline" href={info.demo ? `/v/${m.label}` : `/v/${m.label}?org=${name}`}>{m.label}</Link><div className="mono break-all" style={{ color: 'var(--muted)' }}>{m.fqn}</div></td>
                  <td className="px-3 py-3">{m.role ?? '—'}<div className="text-xs" style={{ color: 'var(--muted)' }}>{m.since ? `since ${m.since}` : ''}</div></td>
                  <td className="px-3 py-3">{m.status === 'active' ? <span className="pill pill-ok">active</span> : <span className="pill pill-warn">former · revoked {day(m.revokedAt)}</span>}</td>
                  <td className="px-3 py-3 mono">{m.username ? `@${m.username}` : '—'}<div style={{ color: 'var(--muted)' }}>{m.telegramId ?? 'not onboarded'}</div></td>
                  <td className="px-5 py-3 text-right">
                    {m.status === 'active' && (
                      <div className="flex justify-end gap-2">
                        <button className="btn" onClick={() => makeInvite(m.label)} disabled={busy !== null || !isAdmin} title={isAdmin ? 'Sign to create a one-time link' : 'Sign in with the owner wallet first'}>{busy === `inv-${m.label}` ? 'Signing…' : 'Invite link'}</button>
                        <button className="btn btn-danger" onClick={() => revoke(m.label)} disabled={busy !== null || !isAdmin} title={isAdmin ? 'Sign to revoke on-chain' : 'Sign in with the owner wallet first'}>{busy === `rev-${m.label}` ? 'Revoking… (~15 s)' : 'Revoke'}</button>
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
        <section className="pop card flex flex-wrap items-center gap-5 p-5">
          <InviteQR url={invite.url} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="font-semibold">{invite.title}</div>
            <p className="mono break-all rounded-lg p-3" style={{ background: 'var(--info-bg)' }}>{invite.url}</p>
            <div className="flex flex-wrap items-center gap-2"><CopyButton text={invite.url} label="Copy link" /><span className="text-xs" style={{ color: 'var(--muted)' }}>or scan the code with a phone</span></div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{invite.note}</p>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Add member</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Registers <span className="mono">label.{info.team}</span>, sets role and start date, then creates the Telegram link. You sign once; the operator sends the transactions, so you pay no gas.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className="input" placeholder="label (carol)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} autoCapitalize="none" aria-label="Member label" />
            <input className="input" placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label="Role" />
            <input className="input" type="date" value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} aria-label="Start date" />
          </div>
          <button className="btn btn-primary" onClick={add} disabled={busy !== null || !isAdmin || !form.label}>{busy === 'add' ? 'Registering on-chain… (~25 s)' : isAdmin ? 'Add member' : 'Sign in to add members'}</button>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Alerts and sharing</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {tgAdmins > 0 ? `${tgAdmins} Telegram account${tgAdmins > 1 ? 's receive' : ' receives'} an alert whenever someone checks a lookalike or a former member of ${info.org}.` : 'Get a Telegram message the moment someone checks a lookalike or a former member of your team.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={connectTelegram} disabled={busy !== null || !isAdmin}>{busy === 'tg' ? 'Signing…' : 'Connect Telegram alerts'}</button>
            <CopyButton text={checkUrl} label="Copy check link" />
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>The check link lets anyone verify a person against {info.org} without an account. API: <span className="mono">GET /api/v1/check?org={info.org}&amp;username=…</span></p>
        </section>
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Delegation (Enhanced Access Control)</h2>
        {!deleg ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Reading roles…</p> : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <p className="mono break-all text-xs" style={{ color: 'var(--muted)' }}>{deleg.selfServe ? 'Kakunin operator' : 'HR'} {deleg.hr}</p>
              <div><div className="mb-1 text-sm font-semibold" style={{ color: 'var(--muted)' }}>On {deleg.teamRegistry.name}</div>
                <ul className="space-y-1"><Perm ok={deleg.teamRegistry.register} label="Register members" /><Perm ok={deleg.teamRegistry.unregister} label="Revoke members" /><Perm ok={deleg.teamRegistry.renew} label="Renew" /><Perm ok={deleg.teamRegistry.setResolver} label="Change resolver" /><Perm ok={deleg.teamResolver.setText} label="Edit member records" /></ul></div>
              <div><div className="mb-1 text-sm font-semibold" style={{ color: 'var(--muted)' }}>On {deleg.orgRegistry.name} (root)</div>
                <ul className="space-y-1"><Perm ok={deleg.orgRegistry.register} label="Register subnames" /><Perm ok={deleg.orgRegistry.unregister} label="Unregister “team”" /><Perm ok={deleg.orgRegistry.setResolver} label="Change resolver" /><Perm ok={deleg.orgResolver.setText} label="Edit org records" /></ul></div>
            </div>
            <div className="space-y-3 text-sm">
              <p style={{ color: 'var(--muted)' }}>
                {deleg.selfServe ? 'Your wallet owns the name and holds every role. The operator only runs the team. You can take its rights away on-chain at any time; members then stop being manageable by Kakunin, and everything already published stays valid.'
                  : 'HR can run the team but can never touch the organisation’s root name. Grant and revoke need the owner wallet.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="btn" disabled={busy !== null} onClick={() => grantHr(true)}>Grant roles</button>
                <button className="btn btn-danger" disabled={busy !== null} onClick={() => grantHr(false)}>Revoke roles</button>
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>These two buttons send a transaction from your own wallet on Sepolia (you pay the gas).</p>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Impersonation alerts</h2>
        {!info.demo && !session ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Alerts are private to your organisation. Sign in with the owner wallet to see them.</p>
          : alerts.length === 0 ? <p className="text-sm" style={{ color: 'var(--muted)' }}>No one has tried to impersonate {info.org} yet.</p> : (
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
