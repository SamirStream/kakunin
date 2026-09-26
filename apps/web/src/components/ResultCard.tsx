'use client'
import { useState } from 'react'
import { renderResult } from '@kakunin/core/messages'
import type { CheckResult } from '@kakunin/core'
import { Stamp } from './Stamp'

const LABEL: Record<string, { color: string; label: string }> = {
  verified: { color: 'var(--ok)', label: 'Verified member' },
  former: { color: 'var(--warn)', label: 'Former member' },
  lookalike: { color: 'var(--bad)', label: 'Lookalike' },
  unknown: { color: 'var(--info)', label: 'Unknown' },
}

// What to do next, per answer: a result is only useful if it tells a stressed person the safe move.
const ADVICE: Record<string, string> = {
  verified: 'This is the real person. Still never run code, install files or sign anything just because someone asked.',
  former: 'They no longer speak for the project. Do not act on their requests.',
  lookalike: 'Treat as a scammer: do not reply, do not open files or links, block and report the account.',
  unknown: 'Nothing on the project’s public team list backs this claim. Ask them to verify on Kakunin before you continue.',
}

/** Who to report from this result: the organisation being impersonated and what the person typed (an @username or a numeric ID). */
export interface ReportTarget { org: string; who: string }

function ReportBox({ target, kind }: { target: ReportTarget; kind: 'impersonation' | 'compromised' }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const w = target.who.trim().replace(/^@/, '')
  const subject = /^\d{5,}$/.test(w) ? { telegramId: w } : { username: w }
  const compromised = kind === 'compromised'
  async function send() {
    setState('busy'); setMsg(null)
    try {
      const res = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ org: target.org, kind, ...subject, note }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? `request failed (${res.status})`)
      setState('done'); setMsg(data.message)
    } catch (e) { setState('idle'); setMsg((e as Error).message) }
  }
  if (state === 'done') return <p className="rounded-lg px-3.5 py-2.5 text-[.84rem]" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }} role="status">{msg}</p>
  return (
    <div className="rounded-lg" style={{ border: '1px dashed var(--line)' }}>
      {!open ? (
        <button type="button" className="w-full px-3.5 py-2.5 text-left text-sm font-semibold underline" onClick={() => setOpen(true)}>
          {compromised ? 'Does this account seem taken over? Tell the organisation' : 'Report this account as an impersonator'}
        </button>
      ) : (
        <div className="space-y-2 px-3.5 py-3 text-sm">
          <p style={{ color: 'var(--muted)' }}>
            {compromised ? `Tell ${target.org} that this official account looks compromised. Its admins are alerted; nothing is published until they confirm.`
              : `Tell ${target.org} that this account impersonates it. Its admins are alerted; nothing is published until they confirm.`}
          </p>
          <textarea className="input" rows={2} maxLength={280} placeholder="What did they say or ask? (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What happened" />
          {msg && <p className="text-xs" style={{ color: 'var(--bad)' }} role="alert">{msg}</p>}
          <div className="flex gap-2"><button type="button" className="btn btn-primary !py-2" onClick={send} disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Send report'}</button><button type="button" className="btn !py-2" onClick={() => setOpen(false)}>Cancel</button></div>
        </div>
      )}
    </div>
  )
}

export type ApiResult = CheckResult | { status: 'unknown'; org: string; reason: 'org-not-registered' }

const explorer = (a: string) => `https://sepolia.etherscan.io/address/${a}`
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button" className="btn !px-3 !py-1 !text-xs"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }}
    >{done ? 'Copied' : label}</button>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[120px_1fr] sm:gap-3">
      <dt className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{k}</dt>
      <dd className="mono break-all">{children}</dd>
    </div>
  )
}

export function ResultCard({ result, shareUrl, compact = false, report }: { result: ApiResult; shareUrl?: string; compact?: boolean; report?: ReportTarget }) {
  const notRegistered = result.status === 'unknown' && (result as { reason?: string }).reason === 'org-not-registered'
  const view = notRegistered
    ? { emoji: '', title: `${result.org} does not publish a team on Kakunin`, lines: ['Nothing to verify against: treat claims of working there as unverified.'] }
    : renderResult(result as CheckResult)
  const r = result as CheckResult
  const compromised = r.status === 'former' && !!r.compromised
  const confirmed = r.status === 'lookalike' && !!r.confirmed
  const tone = compromised ? { color: 'var(--bad)', label: 'Compromised account' } : confirmed ? { color: 'var(--bad)', label: 'Reported impersonator' } : LABEL[result.status]
  const advice = compromised ? 'This official account was taken over. Do not trust anything it sends, even if it looks official. Reach the person through another channel you already trust.'
    : confirmed ? 'The project confirmed this account is an impersonator. Do not reply or open anything: block it and report it in Telegram.' : ADVICE[result.status]
  const canReport = !!report && !notRegistered && ((result.status === 'unknown' && !(result as { reason?: string }).reason) || (result.status === 'lookalike' && !confirmed))
  return (
    <div className="paper pop overflow-hidden" role="status" aria-live="polite">
      <div className="flex items-center gap-4 px-5 pb-3 pt-5">
        <Stamp status={result.status} size={compact ? 76 : 96} animate />
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: tone.color }}>{tone.label}</div>
          <h3 className="text-[1.5rem] font-bold leading-[1.05] tracking-tight">{view.title.replace(/^(Verified member of|Former member of|Lookalike of a real|Unknown to) /, (m) => (m.startsWith('Verified') ? 'Member of ' : m.startsWith('Former') ? 'Was on ' : m.startsWith('Lookalike') ? 'Imitates ' : 'Not on '))}</h3>
        </div>
      </div>
      <div className="space-y-3 px-5 pb-5 text-[.95rem]">
        <div className="space-y-1">
          {view.lines.map((l, i) => (
            <p key={i} className={i === 0 && result.status !== 'unknown' ? 'mono break-all' : ''}>{l}</p>
          ))}
        </div>
        <p className="rounded-lg px-3.5 py-2.5 text-[.84rem]" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}><b>What to do.</b> {advice}</p>
        {canReport && <ReportBox target={report!} kind="impersonation" />}
        {!!report && result.status === 'verified' && <ReportBox target={report} kind="compromised" />}

        {result.status === 'verified' && (
          <details className="rounded-lg" style={{ border: '1px solid var(--line)' }}>
            <summary className="cursor-pointer select-none px-3.5 py-2.5 text-sm font-semibold">Check the proof yourself</summary>
            <div className="space-y-3 px-3.5 pb-3 text-sm" style={{ borderTop: '1px solid var(--line)' }}>
              <dl className="divide-y" style={{ borderColor: 'var(--line)' }}>
                <Row k="ENS name">{result.proof.name}</Row>
                <Row k="Managed by"><a className="underline" href={explorer(result.proof.owner)} target="_blank" rel="noopener noreferrer">{short(result.proof.owner)}</a></Row>
                <Row k="Signed by">{result.proof.attesterName} → <a className="underline" href={explorer(result.proof.attester)} target="_blank" rel="noopener noreferrer">{short(result.proof.attester)}</a></Row>
                <Row k="Record">{result.proof.recordKey}</Row>
                <Row k="Envelope"><span className="mr-2">{result.proof.envelope.slice(0, 40)}…</span><Copy text={result.proof.envelope} /></Row>
                <Row k="Contracts">
                  <a className="underline" href={explorer(result.proof.teamRegistry)} target="_blank" rel="noopener noreferrer">team registry</a>{', '}
                  <a className="underline" href={explorer(result.proof.teamResolver)} target="_blank" rel="noopener noreferrer">team resolver</a> on Sepolia
                </Row>
              </dl>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                The signature covers the member’s ENS name, the managing address, the Telegram ID and the issue time. Change any of them on-chain and it stops verifying.{' '}
                <a className="underline" href="/docs#verify">Re-check it in ten lines</a>.
              </p>
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {shareUrl && <Copy text={shareUrl} label="Copy link to this result" />}
          <Copy text={`${tone.label}: ${view.title}`} label="Copy answer" />
        </div>
      </div>
    </div>
  )
}
