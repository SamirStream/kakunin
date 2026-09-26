import Link from 'next/link'

const STATUSES = [
  { emoji: '✅', name: 'Verified member', text: 'On the org’s ENS team registry, with a valid attestation signed by the org’s own ENS name.', tone: 'ok' },
  { emoji: '🕓', name: 'Former member', text: 'Was on the team; HR revoked the subname. Shows the revocation date.', tone: 'warn' },
  { emoji: '⚠️', name: 'Lookalike', text: 'A handle or name that imitates a real member (homoglyphs, typos).', tone: 'bad' },
  { emoji: '❓', name: 'Unknown', text: 'The org publishes its team and this person is not in it.', tone: 'info' },
] as const

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <p className="pill pill-info w-fit">ETHGlobal Tokyo 2026 · ENSv2 on Sepolia</p>
        <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
          Is this “recruiter” really from that project?
        </h1>
        <p className="max-w-2xl text-lg" style={{ color: 'var(--muted)' }}>
          Impersonation is the #1 social-engineering vector in Web3: fake recruiters lead developers to run malware or sign
          transactions. Tools hunt fakes forever. <b style={{ color: 'var(--ink)' }}>Kakunin certifies the real ones</b>, a finite,
          verifiable list published by each project on ENSv2.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/check" className="btn btn-primary">Check someone</Link>
          <Link href="/demo" className="btn">Watch the demo</Link>
          <Link href="/org/kakunin-demo.eth" className="btn">Org dashboard</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {STATUSES.map((s) => (
          <div key={s.name} className="card p-5">
            <div className="flex items-center gap-2 text-lg font-bold">
              <span aria-hidden>{s.emoji}</span> {s.name}
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{s.text}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="text-xl font-bold">How it works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm" style={{ color: 'var(--muted)' }}>
          <li><b style={{ color: 'var(--ink)' }}>Hierarchical registry.</b> <span className="mono">team.&lt;org&gt;.eth</span> is its own ENSv2 registry; every member is a subname token.</li>
          <li><b style={{ color: 'var(--ink)' }}>Delegated HR.</b> Enhanced Access Control lets an HR wallet register and revoke members without ever controlling the org’s root name.</li>
          <li><b style={{ color: 'var(--ink)' }}>Attestations.</b> The org’s ENS name signs “this Telegram ID belongs to this member” (draft ENSIP: Text Record Attestations). Change the record and it stops verifying.</li>
          <li><b style={{ color: 'var(--ink)' }}>History from events.</b> Revoked names leave the registry state, so “former member since…” is derived from ENSv2 events.</li>
        </ol>
      </section>
    </div>
  )
}
