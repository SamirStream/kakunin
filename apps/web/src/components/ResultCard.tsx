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

export function ResultCard({ result, shareUrl, compact = false }: { result: ApiResult; shareUrl?: string; compact?: boolean }) {
  const notRegistered = result.status === 'unknown' && (result as { reason?: string }).reason === 'org-not-registered'
  const view = notRegistered
    ? { emoji: '', title: `${result.org} does not publish a team on Kakunin`, lines: ['Nothing to verify against: treat claims of working there as unverified.'] }
    : renderResult(result as CheckResult)
  const tone = LABEL[result.status]
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
        <p className="rounded-lg px-3.5 py-2.5 text-[.84rem]" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}><b>What to do.</b> {ADVICE[result.status]}</p>

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
