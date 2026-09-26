import { privateKeyToAccount } from 'viem/accounts'
import { makeAgent } from '@kakunin/paid-api/agent'
import { getScreener, getTokenScreener } from '@kakunin/paid-api/screener'
import { agentBlocked } from '@/lib/guard'
import { json } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Runs the two x402 purchases of the demo agent with the throwaway AGENT key: one to the real Kakunin paid API (screened
// clean -> paid) and one to the fake clone (Intercepta flags its payTo -> blocked BEFORE signing). Every screening is a
// live Intercepta call. Both sellers are routes of THIS app (/api/paid/*), so it works locally and on Vercel alike.
// Access: KAKUNIN_DEMO_SIGNER=1 plus localhost / DEMO_ADMIN_TOKEN, or public + rate limited with KAKUNIN_AGENT_PUBLIC=1.
const TARGETS = [
  { id: 'real', label: 'Kakunin paid API', path: '/api/paid/real?telegramId=100000001' },
  { id: 'clone', label: 'Fake clone of Kakunin', path: '/api/paid/clone?telegramId=100000001' },
] as const

export async function POST(req: Request) {
  const blocked = agentBlocked(req)
  if (blocked) return blocked
  const pk = process.env.AGENT_PRIVATE_KEY
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) return json({ error: 'AGENT_PRIVATE_KEY missing in .env' }, 500)
  let screener, tokenScreener
  try { screener = getScreener(); tokenScreener = getTokenScreener() } catch (e) { return json({ error: (e as Error).message }, 500) }

  const origin = new URL(req.url).origin
  const buy = makeAgent({ signer: privateKeyToAccount(pk as `0x${string}`), screener, tokenScreener })
  const results = []
  for (const t of TARGETS) {
    const r = await buy(origin + t.path)
    results.push({ id: t.id, label: t.label, outcome: r.outcome, event: r.event, result: (r.body as { result?: unknown } | null)?.result ?? null, error: r.error ? r.error.slice(0, 200) : undefined })
  }
  return json({ results })
}
