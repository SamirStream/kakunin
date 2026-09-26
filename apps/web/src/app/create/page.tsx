'use client'
// Self-serve organisation creation: a project picks an ENS name and an owner wallet, and Kakunin provisions the whole ENSv2 setup
// on Sepolia (see packages/core/src/provision.ts). The browser drives the run one bounded step at a time and shows real progress.
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { connectAccount } from '@/lib/wallet'

interface Progress {
  id: string; name: string; status: 'running' | 'done' | 'failed'; step: string; label: string; index: number; total: number
  error: string | null; waitMs: number; txs: string[]; tightenError: string | null
}

const STEPS: { key: string; title: string; detail: string }[] = [
  { key: 'fund', title: 'Fund the organisation key', detail: 'A sponsor sends testnet ETH so your team can be managed without you paying gas.' },
  { key: 'deploy', title: 'Deploy registries and resolvers', detail: 'Four ENSv2 contracts through the VerifiableFactory: org registry, team registry, two resolvers.' },
  { key: 'commit', title: 'Reserve the name', detail: 'First half of the ENS registrar’s commit and reveal.' },
  { key: 'register', title: 'Register the .eth name to your wallet', detail: 'The second half, one minute later. You own the name.' },
  { key: 'wire', title: 'Create the team registry', detail: 'team.<name>.eth, and the attester address published on your name.' },
  { key: 'tighten', title: 'Limit the operator', detail: 'The operator drops every right it needed for setup and keeps only the team.' },
  { key: 'verify', title: 'Verify through ENS', detail: 'Read the result back the way any ENSv2 client does.' },
]
const KEY = 'kk-create-job'
const scan = (h: string) => `https://sepolia.etherscan.io/tx/${h}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function CreateOrg() {
  const [label, setLabel] = useState('')
  const [owner, setOwner] = useState('')
  const [avail, setAvail] = useState<{ ok: boolean; name?: string; reason?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<Progress | null>(null)
  const [wait, setWait] = useState(0)
  const driving = useRef(false)

  // Live availability, straight from ENSv2.
  useEffect(() => {
    setAvail(null)
    if (label.trim().length < 3) return
    const t = setTimeout(() => {
      fetch(`/api/orgs/available?label=${encodeURIComponent(label)}`).then((r) => r.json()).then(setAvail).catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [label])

  const drive = useCallback(async (id: string) => {
    if (driving.current) return
    driving.current = true
    try {
      for (;;) {
        const res = await fetch(`/api/orgs/jobs/${id}`, { method: 'POST' })
        if (!res.ok) throw new Error(res.status === 404 ? 'This run was not found (it may have expired).' : `request failed (${res.status})`)
        const p = (await res.json()) as Progress
        setJob(p)
        if (p.status !== 'running') { try { localStorage.removeItem(KEY) } catch { /* ignore */ } return }
        if (p.waitMs > 0) {
          const until = Date.now() + p.waitMs
          while (Date.now() < until) { setWait(Math.ceil((until - Date.now()) / 1000)); await sleep(500) }
          setWait(0)
        } else await sleep(p.error ? 3000 : 700)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      driving.current = false
    }
  }, [])

  // Resume a run after a refresh.
  useEffect(() => {
    try {
      const id = localStorage.getItem(KEY)
      if (id) void fetch(`/api/orgs/jobs/${id}`).then((r) => (r.ok ? r.json() : null)).then((p: Progress | null) => { if (p) { setJob(p); if (p.status === 'running') void drive(id) } })
    } catch { /* ignore */ }
  }, [drive])

  async function connect() {
    setError(null)
    try { setOwner((await connectAccount()).address) } catch (e) { setError((e as Error).message) }
  }

  async function start(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/orgs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label, owner: owner.trim() }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? `request failed (${res.status})`)
      try { localStorage.setItem(KEY, data.id) } catch { /* ignore */ }
      setJob(data)
      void drive(data.id)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  const ownerOk = /^0x[0-9a-fA-F]{40}$/.test(owner.trim())
  const current = job ? STEPS.findIndex((s) => s.key === job.step) : -1

  if (job) {
    const done = job.status === 'done'
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-2">
          <h1 className="t-h2">{done ? `${job.name} is live.` : job.status === 'failed' ? 'Creation stopped.' : `Creating ${job.name}`}</h1>
          <p className="t-lead" style={{ color: 'var(--muted)' }}>
            {done ? 'Your registries exist on ENSv2, your wallet owns the name, and your team can start verifying people.'
              : job.status === 'failed' ? 'Nothing you own is at risk: the name is only registered at the end of the run.'
                : 'This writes to the chain, so it takes about two and a half minutes. You can leave this tab open and do something else.'}
          </p>
        </div>

        <ol className="card divide-y" style={{ borderColor: 'var(--line)' }} aria-live="polite">
          {STEPS.map((s, i) => {
            const state = done || i < current ? 'done' : i === current ? (job.status === 'failed' ? 'failed' : 'active') : 'todo'
            return (
              <li key={s.key} className="flex gap-3 px-4 py-3" style={{ borderColor: 'var(--line)', opacity: state === 'todo' ? 0.55 : 1 }}>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" aria-hidden
                  style={{ background: state === 'done' ? 'var(--ok-bg)' : state === 'failed' ? 'var(--bad-bg)' : 'var(--info-bg)', color: state === 'done' ? 'var(--ok)' : state === 'failed' ? 'var(--bad)' : 'var(--info)' }}>
                  {state === 'done' ? '✓' : state === 'failed' ? '!' : state === 'active' ? <span className="animate-pulse">●</span> : i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold">{s.title}{state === 'active' && s.key === 'register' && wait > 0 ? ` (${wait}s)` : ''}</div>
                  {(state === 'active' || state === 'failed') && <p className="text-sm" style={{ color: 'var(--muted)' }}>{s.detail}</p>}
                </div>
              </li>
            )
          })}
        </ol>

        {job.status === 'running' && wait > 0 && (
          <p className="pill pill-info whitespace-normal">The ENS registrar requires a one minute delay between reserving and registering a name, so nobody can front-run you. {wait}s left.</p>
        )}
        {job.error && <p className="pill pill-warn max-w-full whitespace-normal break-words" role="alert">{job.status === 'failed' ? 'Failed: ' : 'Retrying after: '}{job.error}</p>}
        {error && <p className="pill pill-bad max-w-full whitespace-normal" role="alert">{error}</p>}

        {job.txs.length > 0 && (
          <details className="card p-4 text-sm">
            <summary className="cursor-pointer font-semibold">{job.txs.length} transactions on Sepolia</summary>
            <ul className="mono mt-2 space-y-1 break-all">
              {job.txs.map((h) => <li key={h}><a className="underline" href={scan(h)} target="_blank" rel="noopener noreferrer">{h}</a></li>)}
            </ul>
          </details>
        )}

        {done && (
          <div className="space-y-4">
            {job.tightenError && <p className="pill pill-warn max-w-full whitespace-normal">The operator kept setup rights on the org root ({job.tightenError}). You can remove them from the dashboard.</p>}
            <div className="flex flex-wrap gap-3">
              <Link className="btn btn-primary !px-6 !py-3 !text-base" href={`/org/${job.name}`}>Open your dashboard</Link>
              <Link className="btn !px-6 !py-3 !text-base" href={`/check?org=${job.name}`}>Try a check</Link>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Next: sign in on the dashboard with the wallet you entered, add your first member and connect Telegram alerts.</p>
          </div>
        )}
        {job.status === 'failed' && <button className="btn" onClick={() => { setJob(null); setError(null) }}>Start over</button>}
      </div>
    )
  }

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        <div className="space-y-3">
          <h1 className="t-h2">Publish your team on ENSv2.</h1>
          <p className="t-lead" style={{ color: 'var(--muted)' }}>Two answers and about two minutes. You get a team registry only you control, ready for members, the Telegram bot and the API.</p>
        </div>
        <form onSubmit={start} className="card space-y-5 p-5">
          <label className="block space-y-1 text-sm font-medium">
            Organisation name
            <div className="flex items-center gap-2">
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="acme" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={36} required aria-describedby="avail" />
              <span className="mono" style={{ color: 'var(--muted)' }}>.eth</span>
            </div>
            <span id="avail" className="block min-h-5 text-xs font-normal" aria-live="polite">
              {avail?.ok ? <span style={{ color: 'var(--ok)' }}>✓ {avail.name} is available</span> : avail ? <span style={{ color: 'var(--bad)' }}>{avail.reason}</span> : label.trim().length >= 3 ? <span style={{ color: 'var(--muted)' }}>Checking ENS…</span> : <span style={{ color: 'var(--muted)' }}>3 to 32 lowercase letters, digits or dashes.</span>}
            </span>
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Owner wallet
            <input className="input mono" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x…" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
            <span className="block text-xs font-normal" style={{ color: 'var(--muted)' }}>
              This wallet will own the name and sign in to your dashboard. It never needs to hold ETH for Kakunin.{' '}
              <button type="button" className="font-semibold underline" onClick={connect}>Use my browser wallet</button>
            </span>
          </label>
          {error && <p className="pill pill-bad max-w-full whitespace-normal" role="alert">{error}</p>}
          <button className="btn btn-primary w-full !py-3" disabled={busy || !avail?.ok || !ownerOk}>{busy ? 'Starting…' : 'Create my organisation'}</button>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Testnet only (Sepolia). Gas is sponsored and the registrar is paid in free test USDC. Creation is limited per visitor while testnet ETH lasts.</p>
        </form>
      </div>

      <aside className="space-y-4 text-sm">
        <h2 className="display text-xl font-bold">What gets created</h2>
        <ul className="space-y-3">
          <li className="card p-4"><b>Your name, in your wallet.</b><p style={{ color: 'var(--muted)' }}><span className="mono">acme.eth</span> is registered to the owner wallet you enter. Kakunin cannot take it.</p></li>
          <li className="card p-4"><b>A team registry.</b><p style={{ color: 'var(--muted)' }}>Every member becomes <span className="mono">name.team.acme.eth</span>. Revoke someone and every answer changes within seconds.</p></li>
          <li className="card p-4"><b>A limited operator.</b><p style={{ color: 'var(--muted)' }}>A key Kakunin manages adds and revokes members and signs attestations, with Enhanced Access Control roles on the team registry only. You can remove it on-chain whenever you like.</p></li>
        </ul>
        <p style={{ color: 'var(--muted)' }}>Want to look around first? <Link className="underline" href="/org/kakunin-demo.eth">Open the sample organisation</Link>.</p>
      </aside>
    </div>
  )
}
