// The live screener used by the agent: the REAL Intercepta / Web3 Antivirus API. No mocks (they would not qualify for the
// prize and would defeat the point). Host + path come from public material (see specs/DECISIONS.md) and are verified by the
// first live call (`pnpm --filter @kakunin/paid-api probe`), which prints the raw response so `mapVerdict` can be finished
// against the real schema instead of a guess. Until then unrecognised responses map to risk "unknown" (=> a human decides).
import type { AddressScreener, AddressVerdict } from '@kakunin/core'

const HOST = process.env.INTERCEPTA_API_URL ?? 'https://api.web3antivirus.io'
const quickScanPath = (address: string) => `/api/public/v2/extension/account/${address}/quick-scan`

export async function rawQuickScan(address: string, apiKey: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(HOST + quickScanPath(address), {
    headers: { accept: 'application/json', 'x-api-key': apiKey },
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* keep text */ }
  return { status: res.status, body }
}

/** Map the Intercepta response onto our risk levels. Finished after the first real call: see DECISIONS.md. */
export function mapVerdict(address: string, body: unknown): AddressVerdict {
  const keys = body && typeof body === 'object' ? Object.keys(body as object).join(',') : typeof body
  return { address, risk: 'unknown', reasons: [`unmapped Intercepta response (fields: ${keys})`] }
}

export function getScreener(): AddressScreener {
  const key = process.env.INTERCEPTA_API_KEY
  if (!key || key === 'placeholder') throw new Error('INTERCEPTA_API_KEY missing in .env: request a free key at https://intercepta.io/ethglobal')
  return {
    async screenAddress(address) {
      const { status, body } = await rawQuickScan(address, key)
      if (status !== 200) throw new Error(`Intercepta HTTP ${status}`) // fail closed: the policy asks a human, never auto-pays
      return mapVerdict(address, body)
    },
  }
}
