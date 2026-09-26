// Human-readable rendering of a CheckResult (Telegram bot + web share the same wording).
import type { CheckResult } from './check'

const day = (unix: number | null) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : 'unknown date')

export function renderResult(r: CheckResult): { emoji: string; title: string; lines: string[] } {
  switch (r.status) {
    case 'verified':
      return {
        emoji: '✅',
        title: `Verified member of ${r.org}`,
        lines: [
          `${r.member.fqn}`,
          `Role: ${r.member.role ?? 'n/a'} · since ${r.member.since ?? 'n/a'}`,
          `Attested by ${r.org} (signature valid, issued ${day(r.attestation.issuedAt)}).`,
        ],
      }
    case 'former':
      if (r.compromised)
        return {
          emoji: '🚨',
          title: `Compromised account of ${r.org}`,
          lines: [
            `${r.member.fqn}`,
            `Marked as compromised by ${r.org} on ${day(r.revokedAt)}. Do NOT trust messages from this account, even if they look official. Confirm through another channel.`,
          ],
        }
      return {
        emoji: '🕓',
        title: `Former member of ${r.org}`,
        lines: [
          `${r.member.fqn}`,
          `Access revoked on ${day(r.revokedAt)}. Do NOT treat this person as speaking for ${r.org}.`,
        ],
      }
    case 'lookalike':
      if (r.confirmed)
        return {
          emoji: '🚫',
          title: `Reported impersonator of ${r.org}`,
          lines: [
            `Confirmed by ${r.org} on ${day(Math.floor(r.confirmed.at / 1000))}${r.confirmed.note ? `: ${r.confirmed.note}` : ''}.`,
            ...(r.lookalikeOf ? [`It also imitates "${r.lookalikeOf.handle}" (${r.lookalikeOf.fqn}).`] : []),
            'It is NOT a member. Do not run code, open files or sign anything.',
          ],
        }
      return {
        emoji: '⚠️',
        title: `Lookalike of a real ${r.org} member`,
        lines: [
          r.lookalikeOf ? `This handle imitates "${r.lookalikeOf.handle}" (${r.lookalikeOf.fqn}).` : 'This handle imitates a real member.',
          'It is NOT that person. Likely impersonation: do not run code, open files or sign anything.',
        ],
      }
    case 'unknown':
      return {
        emoji: '❓',
        title: r.reason === 'invalid-attestation' ? `Unverifiable claim about ${r.org}` : `Unknown to ${r.org}`,
        lines:
          r.reason === 'invalid-attestation'
            ? ['A record exists but its attestation does not verify. Treat as fraudulent.']
            : r.reason === 'no-identifier'
              ? ['Send a @username, or forward a message from the person.']
              : [`${r.org} publishes its team and this person is not in it. Do not trust claims of working there.`],
      }
  }
}

/** Plain-text form (Telegram/CLI). */
export const formatResult = (r: CheckResult): string => {
  const { emoji, title, lines } = renderResult(r)
  return [`${emoji} ${title}`, ...lines].join('\n')
}

/** Alert sent to the impersonated org. */
export const formatAlert = (org: string, kind: CheckResult['status'], subject: string): string =>
  kind === 'former'
    ? `🕓 ${org}: a REVOKED former member was just checked (${subject}).`
    : `🚨 ${org}: someone just checked "${subject}" claiming to represent you — result: ${kind}. Possible impersonation attempt.`
