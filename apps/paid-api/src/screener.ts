// The live screener used by the agent. Must call the real Intercepta API (mocked responses do not qualify for the prize
// and would defeat the point). The adapter is written once the API contract is confirmed from the docs / API key email.
import type { AddressScreener } from '@kakunin/core'

export function getScreener(): AddressScreener {
  if (!process.env.INTERCEPTA_API_KEY || process.env.INTERCEPTA_API_KEY === 'placeholder')
    throw new Error('INTERCEPTA_API_KEY missing in .env: request a free key at https://intercepta.io/ethglobal')
  throw new Error('Intercepta adapter not implemented yet: waiting for the API reference (docs are behind a bot wall)')
}
