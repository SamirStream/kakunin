import Link from 'next/link'
import { HeroDesk } from '@/components/HeroDesk'
import { Stamp, type Verdict } from '@/components/Stamp'

const ANSWERS: { status: Verdict; name: string; text: string }[] = [
  { status: 'verified', name: 'Verified member', text: 'On the project’s team registry and signed by the project’s own ENS name. Comes with proof anyone can check.' },
  { status: 'former', name: 'Former member', text: 'Was on the team until HR revoked the name. Shows the exact date, read from the chain.' },
  { status: 'lookalike', name: 'Lookalike', text: 'A handle or display name that imitates a real member: swapped letters, look-alike glyphs, one typo away.' },
  { status: 'unknown', name: 'Unknown', text: 'The project publishes its team and this person is not on it. No claim of working there stands.' },
]

const STEPS = [
  { n: '1', title: 'The project publishes its team', text: 'Each member is a name on an ENSv2 registry, team.project.eth. An HR wallet manages it and can never touch the project’s root name.' },
  { n: '2', title: 'Members prove their account once', text: 'HR sends a one-time Telegram link. The member opens it, and the project’s ENS name signs their numeric Telegram ID. No wallet, no forms.' },
  { n: '3', title: 'Anyone checks in a second', text: 'Forward a message to the bot, use the site, or call the API. Revoke someone and every answer changes within seconds.' },
]

export default function Home() {
  return (
    <div className="space-y-28 pb-10">
      {/* Hero: the promise, and the one memorable moment (the stamp) */}
      <section className="grid items-center gap-12 pt-4 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
        <div className="space-y-7">
          <h1 className="t-hero" style={{ fontSize: "clamp(2.6rem, 6.3vw, 5.4rem)" }}>Is this recruiter really from that project?</h1>
          <p className="t-lead" style={{ color: 'var(--muted)' }}>
            Fake recruiters are how crypto teams get hacked. Chasing fakes never ends, so Kakunin does the opposite: each project publishes the short list of people who are real, and anyone can check against it.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/create" className="btn btn-primary !px-6 !py-3 !text-base">Create your organisation</Link>
            <Link href="/demo" className="btn !px-6 !py-3 !text-base">Watch it work</Link>
            <a href="https://t.me/KakuninxyzBot/app" target="_blank" rel="noopener noreferrer" className="btn !px-6 !py-3 !text-base">Open in Telegram</a>
          </div>
        </div>
        <HeroDesk />
      </section>

      {/* The four answers, as the stamps themselves */}
      <section aria-labelledby="answers" className="space-y-10">
        <div className="max-w-2xl space-y-3">
          <h2 id="answers" className="t-h2">Every answer is a stamp, and every stamp has a reason.</h2>
          <p className="t-lead" style={{ color: 'var(--muted)' }}>The kanji says what happened. The text beside it says why, and what to do next.</p>
        </div>
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4" style={{ borderTop: '1px solid var(--line)', paddingTop: '2.5rem' }}>
          {ANSWERS.map((a) => (
            <div key={a.status} className="space-y-4">
              <Stamp status={a.status} size={104} />
              <div>
                <h3 className="text-xl font-bold tracking-tight">{a.name}</h3>
                <p className="mt-1.5 text-[.95rem]" style={{ color: 'var(--muted)' }}>{a.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works: a true sequence, so numbered */}
      <section aria-labelledby="how" className="space-y-10">
        <h2 id="how" className="t-h2 max-w-2xl">Three steps, no wallet for the people being verified.</h2>
        <ol className="grid gap-10 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="space-y-3 pt-5" style={{ borderTop: '2px solid var(--ink)' }}>
              <span className="display block text-6xl font-extrabold leading-none tracking-tighter" style={{ color: 'var(--brand)' }} aria-hidden>{s.n}</span>
              <h3 className="text-xl font-bold tracking-tight">{s.title}</h3>
              <p className="text-[.95rem]" style={{ color: 'var(--muted)' }}>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* For projects: self-serve */}
      <section aria-labelledby="projects" className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <h2 id="projects" className="t-h2">Your project can be on it in two minutes.</h2>
          <p className="t-lead" style={{ color: 'var(--muted)' }}>Pick a name, give the wallet that owns it, and Kakunin builds the ENSv2 registries for you. Gas is sponsored on testnet, and you keep the name.</p>
          <div className="flex flex-wrap gap-3"><Link href="/create" className="btn btn-primary !px-6 !py-3 !text-base">Create your organisation</Link><Link href="/orgs" className="btn !px-6 !py-3 !text-base">Projects on Kakunin</Link></div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[['You own the name', 'The .eth name is registered to your wallet, not to Kakunin.'], ['A limited operator', 'Adds and revokes members and signs attestations, with roles on the team registry only. Remove it on-chain any time.'], ['No gas for admins', 'You sign in with your wallet; the operator sends the transactions.'], ['Alerts on Telegram', 'Know when someone checks a lookalike of your team.']].map(([t, d]) => (
            <li key={t} className="card p-4"><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{d}</p></li>
          ))}
        </ul>
      </section>

      {/* Agents: a receipt, because a payment decision is a record */}
      <section aria-labelledby="agents" className="grid items-center gap-12 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 id="agents" className="t-h2">Agents pay for checks, and never pay a scammer.</h2>
          <p className="t-lead" style={{ color: 'var(--muted)' }}>
            The check is also sold per call over x402, for 0.001 USDC. The buying agent screens the destination with a live risk API before it signs anything: clean addresses get paid, flagged ones are refused, and the reason is on the record.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/demo#agents" className="btn">See a payment refused</Link>
            <Link href="/docs#agents" className="btn">Read the API</Link>
          </div>
        </div>
        <div className="paper paper-lift mx-auto w-full max-w-md p-6 mono" style={{ fontSize: '.82rem', lineHeight: 1.7 }} role="img" aria-label="Two payment receipts: one approved, one refused">
          <p className="display text-base font-bold" style={{ fontFamily: 'var(--font-display)' }}>Agent payment log</p>
          <p style={{ color: 'var(--muted)' }}>screened before signing</p>
          <hr className="my-3 border-dashed" style={{ borderColor: 'var(--line)' }} />
          <p>payTo 0x9140…1044</p>
          <p>risk score 0/100</p>
          <p style={{ color: 'var(--ok)' }}><b>PAID</b> 0.001 USDC, check delivered</p>
          <hr className="my-3 border-dashed" style={{ borderColor: 'var(--line)' }} />
          <p>payTo 0x098B…2f96</p>
          <p>risk score 100/100</p>
          <p style={{ color: 'var(--bad)' }}>sanction_address, known_scammer</p>
          <p style={{ color: 'var(--bad)' }}><b>REFUSED</b> nothing signed</p>
        </div>
      </section>

      {/* The Mini App, live */}
      <section aria-labelledby="miniapp" className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
        <div className="max-w-xl space-y-5">
          <h2 id="miniapp" className="t-h2">It lives where the scam starts: inside Telegram.</h2>
          <p className="t-lead" style={{ color: 'var(--muted)' }}>
            Telegram tells Kakunin exactly who opened the app, so a member’s card can’t be requested by anyone else. Members carry a verified card, anyone can check a sender, and org admins revoke or invite from their phone.
          </p>
          <a href="https://t.me/KakuninxyzBot/app" target="_blank" rel="noopener noreferrer" className="btn btn-primary !px-6 !py-3 !text-base">Open the Mini App</a>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>The phone on the right is the real app, running on sample data.</p>
        </div>
        <div className="mx-auto" style={{ width: 340 }}>
          <div className="overflow-hidden rounded-[2.4rem] p-2.5 paper-lift" style={{ background: 'var(--ink)' }}>
            <iframe title="Kakunin Telegram Mini App preview" src="/tg?preview=member&tab=card&embed=1" loading="lazy" className="block w-full rounded-[1.9rem] border-0" style={{ height: 620, background: 'var(--bg)' }} />
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="space-y-6 pt-4" style={{ borderTop: '2px solid var(--ink)' }}>
        <h2 className="t-hero !text-[clamp(2.4rem,6vw,5rem)] max-w-4xl pt-8">Stop guessing who is on the other end.</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/check" className="btn btn-primary !px-6 !py-3 !text-base">Check someone now</Link>
          <Link href="/create" className="btn !px-6 !py-3 !text-base">Create your organisation</Link>
        </div>
      </section>
    </div>
  )
}
