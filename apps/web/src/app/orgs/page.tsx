import type { Metadata } from 'next'
import Link from 'next/link'
import { DEPLOYMENT } from '@kakunin/core'
import { store } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Projects', description: 'Projects that publish their team on ENSv2 through Kakunin.' }

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default async function Projects() {
  const orgs = (await store.listOrgs().catch(() => [])).sort((a, b) => b.createdAt - a.createdAt)
  const rows = [
    { name: DEPLOYMENT.orgName, team: DEPLOYMENT.teamName, owner: DEPLOYMENT.orgWallet, registry: DEPLOYMENT.teamRegistry, note: 'Sample organisation', at: null as number | null },
    ...orgs.map((o) => ({ name: o.name, team: o.deployment.teamName, owner: o.owner, registry: o.deployment.teamRegistry, note: 'Self-serve', at: o.createdAt as number | null })),
  ]
  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-3">
        <h1 className="t-h2">Projects on Kakunin</h1>
        <p className="t-lead" style={{ color: 'var(--muted)' }}>Each one publishes its team as names on an ENSv2 registry. Check anyone against any of them.</p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.name} className="card flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="display break-all text-2xl font-bold">{r.name}</h2><p className="mono break-all" style={{ color: 'var(--muted)' }}>{r.team}</p></div>
              <span className="pill pill-info shrink-0">{r.note}</span>
            </div>
            <p className="mono" style={{ color: 'var(--muted)' }}>owner {short(r.owner)} · registry {short(r.registry)}{r.at ? ` · created ${new Date(r.at).toISOString().slice(0, 10)}` : ''}</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link className="btn btn-primary" href={`/org/${r.name}`}>Team</Link>
              <Link className="btn" href={`/check?org=${r.name}`}>Check someone</Link>
            </div>
          </li>
        ))}
      </ul>
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div><h2 className="font-bold">Your project is not here yet</h2><p className="text-sm" style={{ color: 'var(--muted)' }}>Creating it takes about two and a half minutes and no gas.</p></div>
        <Link className="btn btn-primary" href="/create">Create your organisation</Link>
      </div>
    </div>
  )
}
