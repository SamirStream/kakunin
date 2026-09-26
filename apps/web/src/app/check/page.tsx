'use client'
import { useEffect, useState } from 'react'
import { ResultCard, type ApiResult } from '@/components/ResultCard'

export default function CheckPage() {
  const [org, setOrg] = useState('kakunin-demo.eth')
  const [who, setWho] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [known, setKnown] = useState<string[]>(['kakunin-demo.eth'])
  useEffect(() => { fetch('/api/orgs').then((r) => r.json()).then((d: { orgs: { name: string }[] }) => setKnown(['kakunin-demo.eth', ...d.orgs.map((o) => o.name)])).catch(() => {}) }, [])

  async function submit(o: string, w0: string, n: string) {
    setBusy(true); setError(null); setResult(null)
    try {
      const w = w0.trim()
      const body = { org: o, displayName: n || undefined, ...(/^\d{5,}$/.test(w) ? { telegramId: w } : { username: w.replace(/^@/, '') || undefined }) }
      const res = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(`check failed (${res.status})`)
      setResult(await res.json())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const run = (e: React.FormEvent) => { e.preventDefault(); void submit(org, who, name) }
  // Shareable link: /check?org=kakunin-demo.eth&who=@alice_kakunin runs the check on load.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const o = q.get('org') ?? 'kakunin-demo.eth'
    setOrg(o)
    const w = q.get('who')
    if (!w) return
    const n = q.get('name') ?? ''
    setWho(w); setName(n)
    void submit(o, w, n)
  }, [])

  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-3">
        <h1 className="t-h2">Check someone before you trust them.</h1>
        <p className="t-lead" style={{ color: 'var(--muted)' }}>
          Paste the @username or numeric Telegram ID of a person claiming to work for a project. Free and public.
        </p>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form onSubmit={run} className="card space-y-4 p-5">
        <label className="block space-y-1 text-sm font-medium">
          Organization (ENS name)
          <input className="input mono" list="kk-orgs" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="kakunin-demo.eth" autoCapitalize="none" spellCheck={false} />
          <datalist id="kk-orgs">{known.map((o) => <option key={o} value={o} />)}</datalist>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          @username or Telegram ID
          <input className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="@alice_kakunin" autoCapitalize="none" spellCheck={false} required />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Display name <span style={{ color: 'var(--muted)' }}>(optional, used for lookalike detection)</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice Martin" />
        </label>
        <button className="btn btn-primary w-full" disabled={busy || !who.trim()}>{busy ? 'Checking on ENS…' : 'Check'}</button>
      </form>
      <div className="space-y-4" aria-live="polite">
        {busy && <div className="h-40 animate-pulse rounded-[10px]" style={{ background: 'var(--info-bg)' }} aria-hidden />}
        {error && <p className="pill pill-bad max-w-full whitespace-normal" role="alert">{error}</p>}
        {result && (
          <ResultCard
            result={result}
            report={{ org, who }}
            shareUrl={typeof window === 'undefined' ? undefined : `${window.location.origin}/check?org=${encodeURIComponent(org)}&who=${encodeURIComponent(who.trim())}`}
          />
        )}
        {!busy && !result && !error && (
          <div className="rounded-[10px] p-6 text-sm" style={{ border: '1px dashed var(--line)', color: 'var(--muted)' }}>
            The answer will be stamped here. Every failed check that claims a project also sends that project an impersonation alert.
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
