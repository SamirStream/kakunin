'use client'
import { useState } from 'react'
import { renderResult } from '@kakunin/core/messages'
import type { CheckResult } from '@kakunin/core'

const TONE: Record<string, { bg: string; fg: string; label: string }> = {
  verified: { bg: 'var(--ok-bg)', fg: 'var(--ok)', label: 'Verified' },
  former: { bg: 'var(--warn-bg)', fg: 'var(--warn)', label: 'Former member' },
  lookalike: { bg: 'var(--bad-bg)', fg: 'var(--bad)', label: 'Lookalike' },
  unknown: { bg: 'var(--info-bg)', fg: 'var(--info)', label: 'Unknown' },
}

// What to do next, per answer: a result is only useful if it tells a stressed person the safe move.
const ADVICE: Record<string, string> = {
  verified: 'This is the real person. Still never run code, install files or sign anything just because someone asked.',
  former: 'Not speaking for the project any more. Do not act on their requests.',
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
      type="button" className="btn !px-2 !py-0.5 !text-xs"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }}
    >{done ? 'Copied ✓' : label}</button>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[130px_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{k}</dt>
      <dd className="mono break-all">{children}</dd>
    </div>
  )
}

export function ResultCard({ result, shareUrl }: { result: ApiResult; shareUrl?: string }) {
  const notRegistered = result.status === 'unknown' && (result as { reason?: string }).reason === 'org-not-registered'
  const view = notRegistered
    ? { emoji: '❓', title: `${result.org} does not publish a team on Kakunin`, lines: ['Nothing to verify against: treat claims of working there as unverified.'] }
    : renderResult(result as CheckResult)
  const tone = TONE[result.status]
  return (
    <div className="pop card overflow-hidden" role="status" aria-live="polite">
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: tone.bg, color: tone.fg }}>
        <span className="text-2xl" aria-hidden>{view.emoji}</span>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{tone.label}</div>
          <div className="text-lg font-bold leading-tight">{view.title}</div>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="space-y-1.5">
          {view.lines.map((l, i) => (
            <p key={i} className={i === 0 && result.status !== 'unknown' ? 'mono break-all' : ''}>{l}</p>
          ))}
        </div>
        <p className="rounded-lg p-3 text-xs" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}><b>What to do:</b> {ADVICE[result.status]}</p>

        {result.status === 'verified' && (
          <details className="group rounded-lg border" style={{ borderColor: 'var(--line)' }}>
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">Proof: verify it yourself, without trusting Kakunin</summary>
            <div className="space-y-3 border-t px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
              <dl className="divide-y" style={{ borderColor: 'var(--line)' }}>
                <Row k="ENS name">{result.proof.name}</Row>
                <Row k="Managed by">
                  <a className="underline" href={explorer(result.proof.owner)} target="_blank" rel="noopener noreferrer">{short(result.proof.owner)}</a>
                </Row>
                <Row k="Signed by">
                  {result.proof.attesterName} → <a className="underline" href={explorer(result.proof.attester)} target="_blank" rel="noopener noreferrer">{short(result.proof.attester)}</a>
                </Row>
                <Row k="Record key">{result.proof.recordKey}</Row>
                <Row k="Envelope"><span className="mr-2">{result.proof.envelope.slice(0, 44)}…</span><Copy text={result.proof.envelope} /></Row>
                <Row k="Contracts">
                  <a className="underline" href={explorer(result.proof.teamRegistry)} target="_blank" rel="noopener noreferrer">team registry</a>
                  {' · '}
                  <a className="underline" href={explorer(result.proof.teamResolver)} target="_blank" rel="noopener noreferrer">team resolver</a>
                  {' · Sepolia'}
                </Row>
              </dl>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                The signature covers the member’s ENS name, the managing address, the Telegram ID and the issue time, and is valid only while the attester name still resolves to the signer.
                Change any of them on-chain and it stops verifying. <a className="underline" href="/docs#verify">How to re-check it in 10 lines</a>.
              </p>
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {shareUrl && <Copy text={shareUrl} label="Copy link to this result" />}
          <Copy text={`${tone.label}: ${view.title}`} label="Copy answer" />
        </div>
      </div>
    </div>
  )
}
