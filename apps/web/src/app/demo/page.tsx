'use client'
import { useCallback, useEffect, useState } from 'react'
import { ResultCard, type ApiResult } from '@/components/ResultCard'
import { AgentPayments } from '@/components/AgentPayments'
import { demoHeaders, getDemoToken, setDemoToken } from '@/lib/demoToken'

// Scripted demo (specs: 4 minutes). Every check is a REAL read of ENSv2 on Sepolia; nothing here is mocked.
const SCENARIOS = [
  { id: 'unknown', label: '1 · “Recruiter from KakuninDemo” DMs a developer', hint: '@satoshi_recruiter', body: { username: 'satoshi_recruiter', displayName: 'Satoshi R. (KakuninDemo Recruiter)' } },
  { id: 'lookalike', label: '2 · A lookalike of the real Alice', hint: '@alice_kakunn', body: { username: 'alice_kakunn', displayName: 'Alice Martin' } },
  { id: 'alice', label: '3 · The real Alice', hint: 'Telegram ID 100000001', body: { telegramId: '100000001' } },
  { id: 'bob', label: '4 · Bob, before / after HR revokes him', hint: 'Telegram ID 100000002', body: { telegramId: '100000002' } },
] as const

interface Alert { id: string; at: number; kind: string; detail: string }

export default function DemoPage() {
  const [results, setResults] = useState<Record<string, ApiResult>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [note, setNote] = useState<string | null>(null)

  const loadAlerts = useCallback(async () => {
    const r = await fetch('/api/alerts', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (r) setAlerts(r.alerts)
  }, [])
  useEffect(() => { loadAlerts(); const t = setInterval(loadAlerts, 3000); return () => clearInterval(t) }, [loadAlerts])
  // /demo?run=all replays the four read-only scenarios on load (handy for screenshots and dry runs).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('run') !== 'all') return
    ;(async () => { for (const s of SCENARIOS) await check(s.id, s.body) })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function check(id: string, body: object) {
    setBusy(id)
    const res = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ org: 'kakunin-demo.eth', ...body }) })
    if (res.ok) {
      const data = (await res.json()) as ApiResult
      setResults((r) => ({ ...r, [id]: data }))
    }
    setBusy(null)
    loadAlerts()
  }

  // "Play the story": the four scenarios in order with a beat between them, so the presenter can talk instead of clicking.
  const [playing, setPlaying] = useState(false)
  async function play() {
    setPlaying(true); setResults({})
    for (const s of SCENARIOS) {
      await check(s.id, s.body)
      document.getElementById(`scenario-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      await new Promise((r) => setTimeout(r, 1400))
    }
    setPlaying(false)
  }

  async function act(action: 'revoke' | 'reset') {
    setBusy(action); setNote(null)
    const res = await fetch('/api/demo', { method: 'POST', headers: { 'content-type': 'application/json', ...demoHeaders() }, body: JSON.stringify({ action, label: 'bob' }) })
    const data = await res.json().catch(() => ({}))
    setNote(res.ok ? (action === 'revoke' ? 'HR revoked bob.team.kakunin-demo.eth on-chain. Check Bob again.' : 'Demo reset on-chain.') : (data.error ?? 'failed'))
    setBusy(null)
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-extrabold">Live demo</h1>
          <button className="btn btn-primary" onClick={play} disabled={playing || busy !== null}>{playing ? 'Playing…' : '▶ Play the story'}</button>
        </div>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--muted)' }}>
          Org <span className="mono">kakunin-demo.eth</span> on Sepolia. Each button below performs a real ENSv2 read + attestation verification. Nothing is mocked.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {SCENARIOS.map((s) => (
            <div key={s.id} id={`scenario-${s.id}`} className="card scroll-mt-24 space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{s.label}</div>
                  <div className="mono" style={{ color: 'var(--muted)' }}>{s.hint}</div>
                </div>
                <button className="btn btn-primary" disabled={busy !== null} onClick={() => check(s.id, s.body)}>
                  {busy === s.id ? 'Checking…' : 'Run check'}
                </button>
              </div>
              {results[s.id] && <ResultCard result={results[s.id]} />}
            </div>
          ))}

          <AgentPayments />

          <div className="card space-y-3 p-5">
            <div className="font-semibold">HR controls (server-side demo signer)</div>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Revokes Bob with the HR wallet — the only permission it holds on the team registry — then run check 4 again: he flips to
              “Former member”. Presenter-only: enter the demo admin token (or run locally); anyone else can use the org dashboard with a wallet.
            </p>
            <input
              className="input mono max-w-xs" type="password" placeholder="demo admin token" autoComplete="off"
              defaultValue={typeof window === 'undefined' ? '' : getDemoToken()} onChange={(e) => setDemoToken(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-danger" disabled={busy !== null} onClick={() => act('revoke')}>{busy === 'revoke' ? 'Revoking…' : 'HR: revoke Bob'}</button>
              <button className="btn" disabled={busy !== null} onClick={() => act('reset')}>{busy === 'reset' ? 'Resetting…' : 'Reset demo'}</button>
            </div>
            {note && <p className="pill pill-info">{note}</p>}
          </div>
        </div>

        <aside className="card h-fit space-y-3 p-5">
          <div className="font-semibold">Impersonation alerts to the org</div>
          {alerts.length === 0 && <p className="text-sm" style={{ color: 'var(--muted)' }}>No alerts yet. Run a failing check.</p>}
          <ul className="space-y-2">
            {alerts.slice(0, 8).map((a) => (
              <li key={a.id} className="pop rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--line)' }}>
                <span className={`pill ${a.kind === 'former' ? 'pill-warn' : a.kind === 'lookalike' ? 'pill-bad' : 'pill-info'}`}>{a.kind}</span>
                <div className="mono mt-1 break-all">{a.detail}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{new Date(a.at).toLocaleTimeString()}</div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
