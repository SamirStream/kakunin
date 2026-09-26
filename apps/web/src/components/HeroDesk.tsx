'use client'
// The hero: a recruiter's DM on paper, and the hanko landing on it. The first stamp is scripted (one orchestrated moment);
// after that it answers the visitor: type any handle and the same document gets a fresh, REAL verdict from ENSv2.
import { useEffect, useRef, useState } from 'react'
import { Stamp } from './Stamp'
import type { ApiResult } from './ResultCard'

const EXAMPLES = [
  { label: '@alice_kakunn', who: 'alice_kakunn', hint: 'a lookalike' },
  { label: '100000001', who: '100000001', hint: 'a real member' },
  { label: '@satoshi_recruiter', who: 'satoshi_recruiter', hint: 'a stranger' },
] as const

const titleCase = (s: string) => s.replace(/[_\d-]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Recruiter'

const VERDICT_LINE: Record<string, string> = {
  verified: 'On the team, and signed by the project’s own ENS name.',
  former: 'Was on the team. Access revoked.',
  lookalike: 'Imitates a real member. Not them.',
  unknown: 'Not on the project’s public team list.',
}

export function HeroDesk() {
  const [who, setWho] = useState('alice_kakunn')
  const [shown, setShown] = useState('alice_kakunn')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [stampKey, setStampKey] = useState(0)
  const first = useRef(true)

  async function run(value: string) {
    const w = value.trim().replace(/^@/, '')
    if (!w) return
    setShown(w); setBusy(true); setError(null); setResult(null)
    try {
      const body = /^\d{5,}$/.test(w) ? { telegramId: w } : { username: w }
      const res = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ org: 'kakunin-demo.eth', ...body }) })
      if (res.status === 429) throw new Error('Too many checks in a minute. Wait a moment and try again.')
      if (!res.ok) throw new Error(`The check failed (${res.status}). Try again.`)
      setResult((await res.json()) as ApiResult)
      setStampKey((k) => k + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // The scripted first beat: let the paper settle, then press the stamp.
  useEffect(() => {
    if (!first.current) return
    first.current = false
    const t = setTimeout(() => void run('alice_kakunn'), 900)
    return () => clearTimeout(t)
  }, [])

  const name = titleCase(shown)
  return (
    <div className="mx-auto w-full max-w-[31rem]">
      <div className="doc-settle paper paper-lift relative overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold" style={{ background: 'var(--info-bg)', color: 'var(--info)' }} aria-hidden>{name.charAt(0)}</span>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">{name} <span className="font-normal" style={{ color: 'var(--muted)' }}>(KakuninDemo Recruiter)</span></div>
            <div className="mono truncate" style={{ color: 'var(--muted)' }}>{/^\d{5,}$/.test(shown) ? `id ${shown}` : `@${shown}`}</div>
          </div>
        </div>
        <div className="relative space-y-3 px-5 pb-28 pt-5 text-[.98rem] leading-relaxed">
          <p className="max-w-[24rem] rounded-2xl rounded-tl-sm px-4 py-3" style={{ background: 'var(--info-bg)' }}>Hi! I saw your GitHub. We’re hiring a Solidity dev at KakuninDemo, $12k a month.</p>
          <p className="max-w-[24rem] rounded-2xl rounded-tl-sm px-4 py-3" style={{ background: 'var(--info-bg)' }}>First step is a quick test task: clone this repo and run <span className="mono">npm install</span>. Can you do it today?</p>
          <div className="absolute bottom-3 right-5 min-h-[112px] min-w-[112px]" aria-live="polite">
            {busy && !result && <span className="mono block rounded-full px-3 py-1.5" style={{ background: 'var(--panel)', border: '1px dashed var(--line)', color: 'var(--muted)' }}>reading ENSv2…</span>}
            {result && <Stamp key={stampKey} status={result.status} size={112} animate />}
          </div>
        </div>
        <div className="px-5 py-3 text-sm" style={{ borderTop: '1px solid var(--line)', background: 'color-mix(in srgb, var(--info-bg) 55%, var(--panel))' }}>
          {error ? <span style={{ color: 'var(--bad)' }} role="alert">{error}</span>
            : result ? <span><b>{result.status === 'verified' ? 'Verified' : result.status === 'former' ? 'Former member' : result.status === 'lookalike' ? 'Lookalike' : 'Unknown'}.</b> {VERDICT_LINE[result.status]}</span>
              : <span style={{ color: 'var(--muted)' }}>Checking this sender against kakunin-demo.eth…</span>}
        </div>
      </div>

      <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(who) }} role="search" aria-label="Check another sender">
        <label className="sr-only" htmlFor="hero-who">@username or Telegram ID</label>
        <input id="hero-who" className="input" placeholder="Check another sender: @username or ID" value={who} onChange={(e) => setWho(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button className="btn btn-primary shrink-0" disabled={busy || !who.trim()}>Stamp it</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
        <span>Try</span>
        {EXAMPLES.map((e) => (
          <button key={e.who} type="button" className="btn !px-3 !py-1 !text-[.8rem]" disabled={busy} onClick={() => { setWho(e.label); void run(e.who) }} title={e.hint}>
            <span className="mono">{e.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
