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
    const w = q.get('who')
    if (!w) return
    const o = q.get('org') ?? 'kakunin-demo.eth', n = q.get('name') ?? ''
    setOrg(o); setWho(w); setName(n)
    void submit(o, w, n)
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Check a person</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Paste the @username (or numeric Telegram ID) of someone claiming to work for a project. Free and public.
        </p>
      </div>
      <form onSubmit={run} className="card space-y-4 p-5">
        <label className="block space-y-1 text-sm font-medium">
          Organization (ENS name)
          <input className="input mono" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="kakunin-demo.eth" autoCapitalize="none" spellCheck={false} />
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
      {busy && <div className="h-24 animate-pulse rounded-2xl" style={{ background: 'var(--info-bg)' }} aria-hidden />}
      {error && <p className="pill pill-bad max-w-full whitespace-normal" role="alert">{error}</p>}
      {result && (
        <ResultCard
          result={result}
          shareUrl={typeof window === 'undefined' ? undefined : `${window.location.origin}/check?org=${encodeURIComponent(org)}&who=${encodeURIComponent(who.trim())}`}
        />
      )}
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Every failed check that claims an org sends that org an impersonation alert. Prefer Telegram? Forward the message to the Kakunin bot.
      </p>
    </div>
  )
}
