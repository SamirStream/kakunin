import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'API', description: 'Kakunin public API: check a person, list a team, embed a badge, or pay per call over x402.' }

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="card overflow-hidden">
      {label && <div className="border-b px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>{label}</div>}
      <pre className="mono overflow-x-auto p-4 text-[13px] leading-relaxed">{children}</pre>
    </div>
  )
}

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="scroll-mt-24 pt-4 text-2xl font-bold">{children}</h2>

export default function Docs() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="pill pill-info w-fit">Public API v1 · no key needed</p>
        <h1 className="text-4xl font-extrabold">Kakunin API</h1>
        <p style={{ color: 'var(--muted)' }}>
          Ask whether a person really belongs to a project. Answers come from an ENSv2 team registry and signed attestations, and every “verified” carries a proof anyone can re-check.
          CORS is open, so browsers, extensions and other sites can call it directly. Limit: 60 requests per minute per client.
          Machine-readable spec: <a className="underline" href="/api/v1/openapi.json">/api/v1/openapi.json</a> (OpenAPI 3.1).
        </p>
      </div>

      <nav aria-label="On this page" className="flex flex-wrap gap-2 text-sm">
        {[['check', 'Check a person'], ['team', 'List a team'], ['badge', 'Badge'], ['agents', 'Agents & x402'], ['verify', 'Verify a proof'], ['bot', 'Telegram bot']].map(([id, t]) => (
          <a key={id} href={`#${id}`} className="pill pill-info hover:opacity-80">{t}</a>
        ))}
      </nav>

      <H2 id="check">Check a person</H2>
      <p className="text-sm">Give the numeric Telegram ID (the identity that is attested) and/or the @username and display name (used for lookalike detection).</p>
      <Code label="Request">{`curl "https://kakunin.xyz/api/v1/check?telegramId=100000001"

# a lookalike of a real member
curl "https://kakunin.xyz/api/v1/check?username=alice_kakunn"`}</Code>
      <Code label="Response (verified, trimmed)">{`{
  "ok": true,
  "api": "v1",
  "checkedAt": "2026-09-27T01:02:03.000Z",
  "result": {
    "status": "verified",
    "org": "kakunin-demo.eth",
    "member": { "fqn": "alice.team.kakunin-demo.eth", "role": "Senior Engineer", "since": "2024-03-01" },
    "attestation": { "valid": true, "signer": "0x9140…1044", "issuedAt": 1790425100, "version": 1 },
    "proof": {
      "chain": "sepolia",
      "attesterName": "kakunin-demo.eth",
      "recordKey": "attestations[org.telegram.id][kakunin-demo.eth]",
      "envelope": "2GF0c3SD…",
      "teamRegistry": "0x40C3…867f"
    }
  }
}`}</Code>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead style={{ color: 'var(--muted)' }}><tr><th className="px-4 py-2">status</th><th className="px-4 py-2">meaning</th></tr></thead>
          <tbody>
            {[
              ['verified', 'Active subname, ID matches, attestation valid. Includes proof.'],
              ['former', 'The subname was revoked. Includes revokedAt (from the ENSv2 event).'],
              ['lookalike', 'No member match, but the handle or name imitates one (lookalikeOf, distance).'],
              ['unknown', 'Not on the team. reason may be invalid-attestation, no-identifier or org-not-registered.'],
            ].map(([s, m]) => <tr key={s} className="border-t" style={{ borderColor: 'var(--line)' }}><td className="mono px-4 py-2">{s}</td><td className="px-4 py-2">{m}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Every non-verified answer also raises an impersonation alert for the org (dashboard feed and Telegram).</p>

      <H2 id="team">List a team</H2>
      <Code label="Request">{`curl "https://kakunin.xyz/api/v1/org/kakunin-demo.eth"`}</Code>
      <p className="text-sm">Returns the members the org publishes (label, ENS name, role, status, dates) and the contract addresses. No Telegram IDs or usernames.</p>

      <H2 id="badge">Badge</H2>
      <Code label="Markdown">{`[![Kakunin](https://kakunin.xyz/api/badge/alice)](https://kakunin.xyz/v/alice)`}</Code>
      <p className="text-sm">
        A live SVG for a team member. Its profile page (<Link className="underline" href="/v/alice">/v/alice</Link>) shows the proof and the attested Telegram ID.
        A badge or a profile link only proves the member exists; to confirm the person you are talking to is them, compare their numeric Telegram ID.
      </p>

      <H2 id="agents">Agents & x402</H2>
      <p className="text-sm">
        The same check is sold per call at <span className="mono">GET /api/paid/real</span> for 0.001 USDC on Base Sepolia. It answers <span className="mono">402 Payment Required</span> with the requirements;
        an x402 client pays and retries. A careful buyer screens the destination <b>before signing</b>:
      </p>
      <Code label="TypeScript (@x402/fetch), screening hook before signing">{`import { x402Client } from '@x402/core/client'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { wrapFetchWithPayment } from '@x402/fetch'

const client = new x402Client()
client.register('eip155:*', new ExactEvmScheme(signer))
client.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
  const risk = await screenWithIntercepta(r.payTo)          // live risk API call
  if (risk.level === 'high' || risk.level === 'critical')
    return { abort: true, reason: risk.reasons.join('; ') }  // refuse BEFORE signing
})
const res = await wrapFetchWithPayment(fetch, client)('https://kakunin.xyz/api/paid/real?telegramId=100000001')`}</Code>
      <p className="text-sm">See it run, with one approved and one blocked payment, in the <Link className="underline" href="/demo">live demo</Link>. Source: <a className="underline" href="https://github.com/SamirStream/kakunin/blob/main/apps/paid-api/src/agent.ts" target="_blank" rel="noopener noreferrer">agent.ts</a>.</p>

      <H2 id="verify">Verify a proof yourself</H2>
      <p className="text-sm">
        A “verified” answer is not a promise from Kakunin. Take the <span className="mono">proof.envelope</span> and check it against ENS. The signer must equal the address that
        the org’s ENS name currently resolves to (draft ENSIP “Text Record Attestations”).
      </p>
      <Code label="TypeScript (viem + cborg)">{`import { decode, encode } from 'cborg'
import { hashMessage, hexToBytes, keccak256, recoverAddress, toHex } from 'viem'

const bytes = Uint8Array.from(Buffer.from(proof.envelope, 'base64'))   // 0xda 61747374 (tag "atst") + CBOR
const [version, issuedAt, signature] = decode(bytes.subarray(5))       // [1, t, sig(65 bytes)]

const payload = encode({ n: proof.name, a: hexToBytes(proof.owner), k: 'org.telegram.id', v: telegramId, t: issuedAt })
const signer = await recoverAddress({ hash: hashMessage({ raw: keccak256(payload) }), signature: toHex(signature) })

// valid  <=>  signer === the address that "kakunin-demo.eth" resolves to (ENS addr record)`}</Code>

      <H2 id="bot">Telegram bot</H2>
      <p className="text-sm">
        <a className="underline" href="https://t.me/KakuninxyzBot" target="_blank" rel="noopener noreferrer">@KakuninxyzBot</a>: forward a suspicious message (or send an @username or numeric ID) and it answers with the same four verdicts.
        Members onboard through a one-time link from their org’s HR; org admins send <span className="mono">/subscribe &lt;secret&gt;</span> to receive impersonation alerts.
      </p>
    </div>
  )
}
