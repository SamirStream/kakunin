'use client'
import { useEffect, useState } from 'react'
import { demoHeaders } from '@/lib/demoToken'

interface Verdict { risk?: string; reasons?: string[]; error?: string }
interface Row {
  id: string
  label: string
  outcome: 'paid' | 'blocked' | 'error'
  event?: { request: { payTo: string; amount: string; asset: string }; verdict: Verdict; decision: { action: string; reasons: string[] } }
  result: { status?: string; member?: { fqn?: string; role?: string | null } } | null
  error?: string
}

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`

export function AgentPayments() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    setBusy(true); setErr(null); setRows(null)
    const res = await fetch('/api/agent', { method: 'POST', headers: demoHeaders() })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setRows(data.results)
    else setErr(data.error ?? `failed (${res.status})`)
    setBusy(false)
  }
  // /demo?run=agent runs it on load (screenshots / dry runs).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('run') === 'agent') void run()
  }, [])

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">5 · An AI agent pays for the check (x402), screened before it signs</div>
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            Every payment: live Intercepta screening of <span className="mono">payTo</span> → pay, refuse or ask a human. USDC on Base Sepolia.
          </div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Agent working…' : 'Run agent purchases'}</button>
      </div>
      {err && <p className="pill pill-bad max-w-full whitespace-normal break-words">{err}</p>}
      {rows && (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => {
            const paid = r.outcome === 'paid'
            const v = r.event?.verdict
            return (
              <div key={r.id} className="pop card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3" style={{ background: paid ? 'var(--ok-bg)' : 'var(--bad-bg)', color: paid ? 'var(--ok)' : 'var(--bad)' }}>
                  <span aria-hidden className="text-xl">{paid ? '✅' : '⛔'}</span>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{paid ? 'Payment approved' : 'Payment blocked before signing'}</div>
                    <div className="font-bold leading-tight">{r.label}</div>
                  </div>
                </div>
                <div className="space-y-2 px-4 py-3 text-sm">
                  {r.event && (
                    <p className="mono break-all" style={{ color: 'var(--muted)' }}>
                      payTo {short(r.event.request.payTo)} · ${(Number(r.event.request.amount) / 1e6).toFixed(3)} USDC
                    </p>
                  )}
                  {v && (
                    <p>
                      <span className={`pill ${v.risk === 'low' ? 'pill-ok' : 'pill-bad'}`}>Intercepta: {v.error ? 'error' : v.risk}</span>
                    </p>
                  )}
                  {v?.reasons?.map((x, i) => <p key={i} className="text-xs">{x}</p>)}
                  {r.event && <p className="text-xs font-semibold">Decision: {r.event.decision.action.toUpperCase()}</p>}
                  {paid && r.result && (
                    <p className="mono break-all text-xs" style={{ color: 'var(--muted)' }}>
                      Kakunin says: {r.result.status}{r.result.member?.fqn ? ` · ${r.result.member.fqn}` : ''}
                    </p>
                  )}
                  {!paid && !r.event && r.error && <p className="text-xs">{r.error}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
