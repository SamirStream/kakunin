'use client'
// At-a-glance numbers and the team's history, derived from what the dashboard already loads (ENSv2 state + registry events).
interface M { label: string; fqn: string; status: 'active' | 'former'; registeredAt: number; revokedAt?: number; telegramId: string | null }
interface A { id: string; at: number; kind: string }

const DAY = 24 * 3600
const fmt = (unix: number) => new Date(unix * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function Stat({ value, label, tone }: { value: number | string; label: string; tone?: 'ok' | 'warn' | 'bad' | 'info' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--ink)'
  return (
    <div className="card p-4">
      <div className="text-3xl font-extrabold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-sm" style={{ color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}

export function OrgInsights({ members, alerts }: { members: M[]; alerts: A[] }) {
  const now = Math.floor(Date.now() / 1000)
  const active = members.filter((m) => m.status === 'active')
  const attested = active.filter((m) => m.telegramId).length
  const recent = alerts.filter((a) => now - a.at / 1000 < DAY).length
  const events = members
    .flatMap((m) => [
      { ts: m.registeredAt, kind: 'added' as const, label: m.label },
      ...(m.status === 'former' && m.revokedAt ? [{ ts: m.revokedAt, kind: 'revoked' as const, label: m.label }] : []),
    ])
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
        <Stat value={active.length} label="Active members" tone="ok" />
        <Stat value={`${attested}/${active.length}`} label="Identity attested" tone={attested === active.length ? 'ok' : 'warn'} />
        <Stat value={members.length - active.length} label="Revoked" tone={members.length - active.length ? 'warn' : 'info'} />
        <Stat value={recent} label="Alerts, last 24 h" tone={recent ? 'bad' : 'info'} />
      </div>
      <section className="card p-4" aria-label="Team history">
        <h2 className="mb-2 font-bold">Team history</h2>
        <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>From ENSv2 registry events: nothing here can be edited off-chain.</p>
        {events.length === 0 ? <p className="text-sm" style={{ color: 'var(--muted)' }}>No events yet.</p> : (
          <ol className="space-y-2">
            {events.map((e, i) => (
              <li key={`${e.label}-${e.kind}-${i}`} className="flex items-center gap-3 text-sm">
                <span className={`pill ${e.kind === 'added' ? 'pill-ok' : 'pill-warn'} w-20 justify-center`}>{e.kind === 'added' ? 'added' : 'revoked'}</span>
                <a className="mono underline" href={`/v/${e.label}`}>{e.label}</a>
                <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>{fmt(e.ts)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
