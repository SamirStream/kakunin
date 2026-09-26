import Link from 'next/link'
import { QuickCheck } from '@/components/QuickCheck'

const ANSWERS = [
  { emoji: '✅', name: 'Verified member', text: 'Active on the project’s ENS team registry, with an attestation signed by the project’s own ENS name.', pill: 'pill-ok' },
  { emoji: '🕓', name: 'Former member', text: 'Was on the team; HR revoked the subname. Shows exactly when.', pill: 'pill-warn' },
  { emoji: '⚠️', name: 'Lookalike', text: 'A handle or name that imitates a real member: homoglyphs, typos, swapped letters.', pill: 'pill-bad' },
  { emoji: '❓', name: 'Unknown', text: 'The project publishes its team and this person is not in it.', pill: 'pill-info' },
] as const

const STEPS = [
  { n: '1', title: 'The project publishes its team', text: 'An ENSv2 registry, team.<org>.eth, holds one subname per member. An HR wallet manages it through Enhanced Access Control, and can never touch the root name.' },
  { n: '2', title: 'Members get attested in one tap', text: 'HR shares a one-time Telegram link. The bot captures the member’s numeric ID and the project’s ENS name signs it. No wallet needed for the member.' },
  { n: '3', title: 'Anyone verifies, in a second', text: 'Forward a message to the bot, use the web check, or call the API. Revoke someone on-chain and they flip to “former member” within seconds.' },
] as const

const STACK = ['ENSv2 registries', 'Enhanced Access Control', 'Text-record attestations', 'Telegram bot', 'x402 payments', 'Intercepta screening'] as const

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <p className="pill pill-info w-fit">ETHGlobal Tokyo 2026 · live on ENSv2 (Sepolia)</p>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            Is this “recruiter” <span style={{ color: 'var(--accent)' }}>really</span> from that project?
          </h1>
          <p className="max-w-xl text-lg" style={{ color: 'var(--muted)' }}>
            Fake recruiters are the #1 way crypto teams get hacked. Chasing fakes never ends. <b style={{ color: 'var(--ink)' }}>Kakunin certifies the real ones</b>: a
            short, verifiable list that each project publishes on ENSv2.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/demo" className="btn btn-primary">Watch the live demo</Link>
            <Link href="/org/kakunin-demo.eth" className="btn">Open the org dashboard</Link>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Free for people. Paid, screened API for AI agents. <Link className="underline" href="/docs">See the API</Link>.
          </p>
        </div>
        <QuickCheck />
      </section>

      <section aria-labelledby="answers" className="space-y-4">
        <h2 id="answers" className="text-2xl font-bold">Four answers, always with proof</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ANSWERS.map((a) => (
            <div key={a.name} className="card space-y-2 p-5">
              <span className={`pill ${a.pill}`}><span aria-hidden>{a.emoji}</span> {a.name}</span>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{a.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="text-2xl font-bold">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card space-y-2 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: 'var(--accent)' }} aria-hidden>{s.n}</span>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card grid gap-6 p-6 md:grid-cols-[1.2fr_1fr]" aria-labelledby="agents">
        <div className="space-y-3">
          <p className="pill pill-info w-fit">For AI agents</p>
          <h2 id="agents" className="text-2xl font-bold">Agents pay per check, and never pay a scammer</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            The paid API speaks x402 (0.001 USDC per check). The buying agent screens the destination with the live Intercepta API <b style={{ color: 'var(--ink)' }}>before it signs</b>:
            approved payments go through, flagged ones are refused, with the reason on screen.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/demo" className="btn">See it run</Link>
            <Link href="/docs" className="btn">API docs</Link>
          </div>
        </div>
        <ul className="space-y-2 self-center text-sm">
          <li className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}><span>Kakunin paid API</span><b>✅ approved</b></li>
          <li className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--bad-bg)', color: 'var(--bad)' }}><span>Fake clone (sanctioned payTo)</span><b>⛔ blocked</b></li>
        </ul>
      </section>

      <section aria-label="Built on" className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <span style={{ color: 'var(--muted)' }}>Built on</span>
        {STACK.map((s) => <span key={s} className="pill pill-info">{s}</span>)}
      </section>
    </div>
  )
}
