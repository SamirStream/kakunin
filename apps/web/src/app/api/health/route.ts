import { usingUpstash } from '@kakunin/core/store'
import { json } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Which cloud capabilities are configured on THIS deployment. Booleans only, never a secret value.
export async function GET() {
  const e = process.env
  const set = (k: string) => !!e[k] && e[k] !== 'placeholder' && e[k] !== 'change-me'
  let webhookUrl: string | null = null
  if (set('TELEGRAM_BOT_TOKEN')) {
    const r = await fetch(`https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/getWebhookInfo`, { signal: AbortSignal.timeout(4000) }).then((x) => x.json() as Promise<{ result?: { url?: string } }>, () => null)
    webhookUrl = r?.result?.url || null
  }
  return json({
    store: usingUpstash() ? 'upstash (persistent)' : e.VERCEL ? 'tmp (ephemeral, per instance)' : 'local file',
    rpc: set('SEPOLIA_RPC_URL') ? 'custom' : 'public default',
    telegram: { token: set('TELEGRAM_BOT_TOKEN'), webhookSecret: set('TELEGRAM_WEBHOOK_SECRET'), adminSecret: set('ADMIN_SECRET'), webhookUrl },
    keys: { org: set('ORG_PRIVATE_KEY'), hr: set('HR_PRIVATE_KEY'), agent: set('AGENT_PRIVATE_KEY') },
    demoSigner: { enabled: e.KAKUNIN_DEMO_SIGNER === '1', adminToken: set('DEMO_ADMIN_TOKEN') },
    agent: { intercepta: set('INTERCEPTA_API_KEY'), public: e.KAKUNIN_AGENT_PUBLIC === '1' },
  })
}
