'use client'
import { useState } from 'react'
import { ResultCard, type ApiResult } from './ResultCard'

// The three answers a first-time visitor should see in five seconds (all real reads of ENSv2 on Sepolia).
const EXAMPLES = [
  { label: '@alice_kakunn', hint: 'lookalike', who: 'alice_kakunn' },
  { label: '100000001', hint: 'real member', who: '100000001' },
  { label: '@satoshi_recruiter', hint: 'stranger', who: 'satoshi_recruiter' },
] as const

export function QuickCheck() {
  const [who, setWho] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ApiResult | null>(null)

  async function run(value: string) {
    const w = value.trim().replace(/^@/, '')
    if (!w) return
    setWho(value); setBusy(true); setError(null); setResult(null)
    try {
      const body = /^\d{5,}$/.test(w) ? { telegramId: w } : { username: w }
      const res = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ org: 'kakunin-demo.eth', ...body }) })
      if (res.status === 429) throw new Error('Too many checks in a minute. Please wait a moment.')
      if (!res.ok) throw new Error(`The check failed (${res.status}). Try again.`)
      setResult(await res.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-4 p-5 shadow-sm">
      <form onSubmit={(e) => { e.preventDefault(); void run(who) }} className="flex flex-col gap-2 sm:flex-row" role="search" aria-label="Check a person">
        <label className="sr-only" htmlFor="qc-who">@username or Telegram ID</label>
        <input
          id="qc-who" className="input flex-1" placeholder="Paste an @username or Telegram ID…" value={who}
          onChange={(e) => setWho(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        />
        <button className="btn btn-primary sm:min-w-32" disabled={busy || !who.trim()}>{busy ? 'Checking…' : 'Check'}</button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
        <span>Try:</span>
        {EXAMPLES.map((e) => (
          <button key={e.who} type="button" className="pill pill-info cursor-pointer hover:opacity-80" onClick={() => void run(e.label)} disabled={busy}>
            <span className="mono">{e.label}</span> <span className="opacity-70">· {e.hint}</span>
          </button>
        ))}
        <span className="ml-auto hidden sm:inline">Org: <span className="mono">kakunin-demo.eth</span></span>
      </div>
      {busy && (
        <div className="space-y-2" aria-hidden>
          <div className="h-14 animate-pulse rounded-xl" style={{ background: 'var(--info-bg)' }} />
          <div className="h-10 animate-pulse rounded-xl" style={{ background: 'var(--info-bg)' }} />
        </div>
      )}
      {error && <p className="pill pill-bad max-w-full whitespace-normal" role="alert">{error}</p>}
      {result && <ResultCard result={result} />}
    </div>
  )
}
