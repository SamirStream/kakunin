import type { Metadata } from 'next'
import { ENSV2, DEPLOYMENT } from '@kakunin/core'
import { usingUpstash } from '@kakunin/core/store'
import { FUND_WEI, MAX_ORGS, SPONSOR_RESERVE_WEI } from '@kakunin/core/provision'
import { formatEther } from 'viem'
import { orgs, pub, store } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Status', description: 'Live status of the Kakunin services.' }

type Row = { name: string; ok: boolean | null; detail: string }

async function probe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: string; ms: number }> {
  const t = Date.now()
  try { return { ok: true, value: await fn(), ms: Date.now() - t } } catch (e) { return { ok: false, error: (e as Error).message.split('\n')[0].slice(0, 90), ms: Date.now() - t } }
}

export default async function Status() {
  const e = process.env
  const set = (k: string) => !!e[k] && e[k] !== 'placeholder' && e[k] !== 'change-me'
  const [block, resolver, names, sponsor] = await Promise.all([
    probe(() => pub.getBlockNumber()),
    probe(() => pub.readContract({ address: ENSV2.universalResolver, abi: [{ type: 'function', name: 'supportsInterface', stateMutability: 'view', inputs: [{ type: 'bytes4' }], outputs: [{ type: 'bool' }] }], functionName: 'supportsInterface', args: ['0x01ffc9a7'] })),
    probe(() => orgs.names()),
    probe(() => pub.getBalance({ address: DEPLOYMENT.orgWallet })),
  ])
  const orgCount = names.ok ? names.value.length - 1 : 0
  const budget = sponsor.ok ? Number((sponsor.value > SPONSOR_RESERVE_WEI ? sponsor.value - SPONSOR_RESERVE_WEI : 0n) / FUND_WEI) : 0
  const slots = Math.max(0, Math.min(MAX_ORGS - orgCount, budget))
  const rows: Row[] = [
    { name: 'Sepolia RPC', ok: block.ok, detail: block.ok ? `block ${block.value} (${block.ms} ms)` : block.error },
    { name: 'ENSv2 Universal Resolver', ok: resolver.ok, detail: resolver.ok ? `reachable (${resolver.ms} ms)` : resolver.error },
    { name: 'Store', ok: names.ok, detail: names.ok ? `${usingUpstash() ? 'Upstash Redis (persistent)' : 'local file'}, ${orgCount} self-serve organisation(s)` : names.error },
    { name: 'Telegram bot', ok: set('TELEGRAM_BOT_TOKEN') && set('TELEGRAM_WEBHOOK_SECRET'), detail: 'webhook configured' },
    { name: 'Organisation creation', ok: (e.KAKUNIN_KEY_SECRET ?? '').length >= 16 && slots > 0, detail: `${slots} sponsored creation(s) left on testnet` },
    { name: 'Agent payments (x402 + Intercepta)', ok: set('AGENT_PRIVATE_KEY') && set('INTERCEPTA_API_KEY'), detail: 'keys configured' },
  ]
  void store
  const all = rows.every((r) => r.ok)
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="t-h2">Status</h1>
        <p className="pill w-fit" style={{ background: all ? 'var(--ok-bg)' : 'var(--warn-bg)', color: all ? 'var(--ok)' : 'var(--warn)' }}>{all ? 'All systems working' : 'Some services need attention'}</p>
      </div>
      <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-4 px-4 py-3 text-sm" style={{ borderColor: 'var(--line)' }}>
            <div className="min-w-0"><div className="font-semibold">{r.name}</div><div className="mono truncate" style={{ color: 'var(--muted)' }}>{r.detail}</div></div>
            <span className={`pill shrink-0 ${r.ok ? 'pill-ok' : 'pill-warn'}`}>{r.ok ? 'operational' : 'attention'}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Testnet deployment (Sepolia). Sponsored gas is finite: when it runs out, creating organisations pauses while checks keep working. Sponsor balance {sponsor.ok ? `${Number(formatEther(sponsor.value)).toFixed(3)} ETH` : 'unknown'}.</p>
    </div>
  )
}
