import { privateKeyToAccount } from 'viem/accounts'
import { makeAgent } from '@kakunin/paid-api/agent'
import { getScreener } from '@kakunin/paid-api/screener'
import { demoSignerBlocked } from '@/lib/guard'
import { json } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Runs the two x402 purchases of the demo agent with the throwaway AGENT key: one to the real Kakunin paid API (screened
// clean -> paid) and one to the fake clone (Intercepta flags its payTo -> blocked BEFORE signing). Every screening is a
// live Intercepta call. Same guard as /api/demo: KAKUNIN_DEMO_SIGNER=1 and localhost only (it can spend the agent's USDC).
const TARGETS = [
  { id: 'real', label: 'Kakunin paid API', url: 'http://localhost:4021/check?telegramId=100000001' },
  { id: 'clone', label: 'Fake clone of Kakunin', url: 'http://localhost:4022/check?telegramId=100000001' },
] as const

export async function POST(req: Request) {
  const blocked = demoSignerBlocked(req)
  if (blocked) return blocked
  const pk = process.env.AGENT_PRIVATE_KEY
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return json({ error: 'AGENT_PRIVATE_KEY missing in .env' }, 500)
  let screener
  try { screener = getScreener() } catch (e) { return json({ error: (e as Error).message }, 500) }

  const up = await Promise.all(TARGETS.map((t) => fetch(t.url, { signal: AbortSignal.timeout(3000) }).then((r) => r.status === 402, () => false)))
  if (up.includes(false)) return json({ error: 'paid API not running: start it with `pnpm paid` (ports 4021 and 4022)' }, 503)

  const buy = makeAgent({ signer: privateKeyToAccount(pk as `0x${string}`), screener })
  const results = []
  for (const t of TARGETS) {
    const r = await buy(t.url)
    results.push({ id: t.id, label: t.label, outcome: r.outcome, event: r.event, result: (r.body as { result?: unknown } | null)?.result ?? null, error: r.error ? r.error.slice(0, 200) : undefined })
  }
  return json({ results })
}
