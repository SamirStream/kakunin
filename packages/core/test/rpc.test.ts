import { describe, expect, it } from 'vitest'
import { FALLBACK_RPCS, rpcUrls } from '../src/ens'

describe('rpcUrls', () => {
  it('puts the configured RPC first, then the public fallbacks', () => {
    const u = rpcUrls('https://eth-sepolia.g.alchemy.com/v2/xyz')
    expect(u[0]).toBe('https://eth-sepolia.g.alchemy.com/v2/xyz')
    expect(u.slice(1)).toEqual([...FALLBACK_RPCS])
  })
  it('does not duplicate a configured public RPC', () => {
    const u = rpcUrls(FALLBACK_RPCS[0])
    expect(u.filter((x) => x === FALLBACK_RPCS[0])).toHaveLength(1)
    expect(u).toHaveLength(FALLBACK_RPCS.length)
  })
  it('ignores empty / non-http values and still has fallbacks', () => {
    expect(rpcUrls(undefined)).toEqual([...FALLBACK_RPCS])
    expect(rpcUrls('placeholder')).toEqual([...FALLBACK_RPCS])
  })
})
