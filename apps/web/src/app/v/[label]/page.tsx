import type { Metadata } from 'next'
import Link from 'next/link'
import { ResultCard } from '@/components/ResultCard'
import { CopyButton } from '@/components/CopyButton'
import { LABEL_RE, lookupMember, org } from '@/lib/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ label: string }> }): Promise<Metadata> {
  const { label } = await params
  return { title: `${label} · ${org}`, description: `What Kakunin can prove about ${label}.team.${org}, straight from ENSv2.`, robots: { index: false } }
}

const SITE = 'https://kakunin.xyz'
const BOT = process.env.TELEGRAM_BOT_USERNAME || 'KakuninxyzBot'

export default async function MemberProfile({ params }: { params: Promise<{ label: string }> }) {
  const label = decodeURIComponent((await params).label).toLowerCase()
  const fqn = `${label}.team.${org}`
  const r = LABEL_RE.test(label) ? await lookupMember(label).catch(() => null) : null
  const md = `[![Kakunin](${SITE}/api/badge/${label})](${SITE}/v/${label})`

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <p className="pill pill-info w-fit">Verification profile</p>
        <h1 className="break-all text-3xl font-extrabold">{fqn}</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Read live from the <span className="mono">{org}</span> team registry on ENSv2 (Sepolia).</p>
      </div>

      {!r && <p className="pill pill-bad whitespace-normal" role="alert">Could not read this profile right now. Try again in a moment.</p>}
      {r?.kind === 'invalid' && <p className="card p-5 text-sm">“{label}” is not a valid member label.</p>}
      {r?.kind === 'unknown' && (
        <div className="card space-y-2 p-5">
          <p className="pill pill-bad w-fit">Not a member</p>
          <p className="text-sm">There is no <span className="mono">{fqn}</span> on the team registry, now or in the past. If someone gave you this link claiming to work at {org}, treat it as suspicious.</p>
        </div>
      )}
      {r?.kind === 'unattested' && (
        <div className="card space-y-2 p-5">
          <p className="pill pill-warn w-fit">Team member, identity not attested yet</p>
          <p className="text-sm">{label} is on the team registry{r.role ? ` as ${r.role}` : ''}, but has not linked a Telegram account yet, so Kakunin cannot confirm that a given account is theirs.</p>
        </div>
      )}
      {r?.kind === 'checked' && (
        <>
          <ResultCard result={r.result} shareUrl={`${SITE}/v/${label}`} />
          <div className="card space-y-3 p-5 text-sm">
            <h2 className="font-bold">Is the person messaging you really {label}?</h2>
            <p>
              This page proves that <b>{label} exists and is (or was) on the team</b>. It does <b>not</b> prove that the person writing to you is them, because anyone can share a link.
              The proof is the account: the Telegram ID attested for {label} is
            </p>
            <p className="mono break-all rounded-lg p-3 text-base font-semibold" style={{ background: 'var(--info-bg)' }}>{r.telegramId}</p>
            <p>
              Forward a message from the person to <a className="underline" href={`https://t.me/${BOT}`} target="_blank" rel="noopener noreferrer">@{BOT}</a>: it checks the sender’s numeric ID against this one.
              If it is not <span className="mono">{r.telegramId}</span>, it is not {label}.
            </p>
          </div>
        </>
      )}

      <div className="card space-y-3 p-5 text-sm">
        <h2 className="font-bold">Embed the status badge</h2>
        <p style={{ color: 'var(--muted)' }}>Live, refreshed every minute. Same caveat: it shows the member’s status, not who is on the other end of a chat.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/badge/${label}`} alt={`Kakunin badge for ${label}`} height={22} />
        <div className="flex flex-wrap items-center gap-2">
          <code className="mono max-w-full flex-1 overflow-x-auto whitespace-nowrap rounded-lg p-2" style={{ background: 'var(--info-bg)' }}>{md}</code>
          <CopyButton text={md} label="Copy Markdown" />
        </div>
      </div>

      <p className="text-sm"><Link className="underline" href="/org/kakunin-demo.eth">See the whole team</Link> · <Link className="underline" href="/docs">API</Link></p>
    </div>
  )
}
