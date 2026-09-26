import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Privacy', description: 'What Kakunin stores, why, and what is public.' }

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-[.98rem]">
      <div className="space-y-2"><h1 className="t-h2">Privacy</h1><p style={{ color: 'var(--muted)' }}>Kakunin is a testnet product built at ETHGlobal Tokyo 2026. This page says plainly what it keeps.</p></div>
      <section className="space-y-2"><h2 className="text-xl font-bold">What is public, by design</h2>
        <p>An organisation’s team registry is public on ENSv2: member names (<span className="mono">label.team.org.eth</span>), roles, start dates, revocation dates and each member’s numeric Telegram ID attested by the organisation. That is what lets anyone verify a person without trusting Kakunin. Members appear on the registry only after they open an invite from their own Telegram account.</p></section>
      <section className="space-y-2"><h2 className="text-xl font-bold">What Kakunin stores off-chain</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Per organisation: a directory of members’ Telegram numeric ID, current @username and display name (used to detect lookalikes and to refresh names), and the impersonation alerts raised by checks.</li>
          <li>Telegram accounts that administer an organisation (numeric ID).</li>
          <li>The organisation’s operator key, encrypted at rest.</li>
          <li>Short-lived rate-limit counters. No cookies, no analytics, no advertising identifiers.</li>
        </ul></section>
      <section className="space-y-2"><h2 className="text-xl font-bold">Who can see what</h2>
        <p>Alerts and @usernames of a self-serve organisation are visible only to signed-in admins of that organisation. A check shows the person checked the verdict and, for verified members, the public proof.</p></section>
      <section className="space-y-2"><h2 className="text-xl font-bold">Your choices</h2>
        <p>Members can be revoked at any time by their organisation. To remove your Telegram account from an organisation’s directory, ask its admins, or open an issue at <a className="underline" href="https://github.com/SamirStream/kakunin" target="_blank" rel="noopener noreferrer">github.com/SamirStream/kakunin</a>. Data written to a blockchain cannot be deleted; revoking a name records the revocation.</p></section>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>See also <Link className="underline" href="/terms">Terms</Link> and <Link className="underline" href="/status">Status</Link>.</p>
    </div>
  )
}
