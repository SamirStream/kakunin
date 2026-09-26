'use client'
import { renderResult } from '@kakunin/core/messages'
import type { CheckResult } from '@kakunin/core'

const TONE: Record<string, { bg: string; fg: string; label: string }> = {
  verified: { bg: 'var(--ok-bg)', fg: 'var(--ok)', label: 'Verified' },
  former: { bg: 'var(--warn-bg)', fg: 'var(--warn)', label: 'Former member' },
  lookalike: { bg: 'var(--bad-bg)', fg: 'var(--bad)', label: 'Lookalike' },
  unknown: { bg: 'var(--info-bg)', fg: 'var(--info)', label: 'Unknown' },
}

export type ApiResult = CheckResult | { status: 'unknown'; org: string; reason: 'org-not-registered' }

export function ResultCard({ result }: { result: ApiResult }) {
  const notRegistered = result.status === 'unknown' && (result as any).reason === 'org-not-registered'
  const view = notRegistered
    ? { emoji: '❓', title: `${result.org} does not publish a team on Kakunin`, lines: ['Nothing to verify against: treat claims of working there as unverified.'] }
    : renderResult(result as CheckResult)
  const tone = TONE[result.status]
  return (
    <div className="pop card overflow-hidden" role="status" aria-live="polite">
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: tone.bg, color: tone.fg }}>
        <span className="text-2xl" aria-hidden>{view.emoji}</span>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{tone.label}</div>
          <div className="text-lg font-bold leading-tight">{view.title}</div>
        </div>
      </div>
      <div className="space-y-1.5 px-5 py-4 text-sm">
        {view.lines.map((l, i) => (
          <p key={i} className={i === 0 && result.status !== 'unknown' ? 'mono break-all' : ''}>{l}</p>
        ))}
        {result.status === 'verified' && (
          <p className="mono break-all pt-1" style={{ color: 'var(--muted)' }}>
            signer {result.attestation.signer} · envelope v{result.attestation.version}
          </p>
        )}
      </div>
    </div>
  )
}
