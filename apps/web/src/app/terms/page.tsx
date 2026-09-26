import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Terms', description: 'Terms of use of the Kakunin testnet service.' }

export default function Terms() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-[.98rem]">
      <div className="space-y-2"><h1 className="t-h2">Terms of use</h1><p style={{ color: 'var(--muted)' }}>Kakunin is open source (MIT) and runs on test networks. These terms keep expectations honest.</p></div>
      <section className="space-y-2"><h2 className="text-xl font-bold">Testnet service</h2>
        <p>Kakunin runs on Ethereum Sepolia and Base Sepolia. Names, registries and payments have no monetary value, and the service can be reset or paused. Gas for creating an organisation is sponsored while testnet funds last.</p></section>
      <section className="space-y-2"><h2 className="text-xl font-bold">What a verdict means</h2>
        <p>“Verified” means the person’s Telegram account is attested by the organisation’s own ENS name and the name is active on its team registry. It does not prove anything about their intentions, and a shared link alone never proves who is writing to you: compare the numeric ID. Lookalike detection is heuristic and can miss creative spoofs. Use judgement, and never run code or sign anything because of a chat message.</p></section>
      <section className="space-y-2"><h2 className="text-xl font-bold">Organisations</h2>
        <p>Organisation owners are responsible for who they add to their registry and for their operator’s rights, which they can revoke on-chain at any time. Do not create organisations that impersonate other projects.</p></section>
      <section className="space-y-2"><h2 className="text-xl font-bold">Acceptable use</h2>
        <p>No abuse of the public API beyond its rate limits, no attempts to impersonate people, and no use of the service to harass. Kakunin may remove organisations from its directory.</p></section>
      <section className="space-y-2"><h2 className="text-xl font-bold">No warranty</h2>
        <p>The service is provided as is, without warranty. Read <Link className="underline" href="/privacy">Privacy</Link> for what is stored, and the <a className="underline" href="https://github.com/SamirStream/kakunin/blob/main/docs/SECURITY.md" target="_blank" rel="noopener noreferrer">security review</a> for known limitations.</p></section>
    </div>
  )
}
