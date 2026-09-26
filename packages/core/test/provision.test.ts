import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { JsonStore } from '../src/store'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deploymentOf, parseOrgLabel, progressOf, startProvision } from '../src/provision'

describe('parseOrgLabel', () => {
  it('accepts plain names, with or without .eth, and lowercases', () => {
    expect(parseOrgLabel('Acme')).toEqual({ ok: true, label: 'acme', name: 'acme.eth' })
    expect(parseOrgLabel(' my-dao.eth ')).toEqual({ ok: true, label: 'my-dao', name: 'my-dao.eth' })
  })
  it('rejects what ENS or a Telegram deep link cannot carry, and reserved names', () => {
    for (const bad of ['ab', 'a'.repeat(33), '-acme', 'acme-', 'ac--me', 'ac me', 'acmé', 'a.b', '', 'xn--abc']) expect(parseOrgLabel(bad).ok, bad).toBe(false)
    for (const reserved of ['kakunin-demo', 'admin', 'team']) expect(parseOrgLabel(reserved).ok, reserved).toBe(false)
  })
})

describe('startProvision guards', () => {
  const store = () => new JsonStore(join(mkdtempSync(join(tmpdir(), 'kk-')), 's.json'))
  const sponsor = privateKeyToAccount(generatePrivateKey())
  const pubWith = (available: boolean, balance: bigint) => ({
    readContract: async () => available,
    getBalance: async () => balance,
  }) as never
  const env = (pub: never) => ({ pub, sponsor, secret: 'a-long-enough-server-secret' })
  const owner = '0x047323424d63D708755F7253ACe78bd7B241cD07' as const

  it('creates a running job with a sealed operator key and reserves the name', async () => {
    const s = store()
    const job = await startProvision(s, env(pubWith(true, 10n ** 18n)), { label: 'acme', owner })
    expect(job).toMatchObject({ name: 'acme.eth', status: 'running', step: 'fund', owner })
    expect(job.operatorKey).not.toMatch(/^0x/) // sealed, never the raw key
    expect(progressOf(job)).toMatchObject({ index: 0, total: 6, status: 'running' })
    await expect(startProvision(s, env(pubWith(true, 10n ** 18n)), { label: 'acme', owner })).rejects.toThrow(/being created/)
  })
  it('refuses taken names, invalid names and an empty sponsor', async () => {
    const s = store()
    await expect(startProvision(s, env(pubWith(false, 10n ** 18n)), { label: 'taken', owner })).rejects.toThrow(/already registered/)
    await expect(startProvision(s, env(pubWith(true, 10n ** 18n)), { label: 'x', owner })).rejects.toThrow(/3 to 32/)
    await expect(startProvision(s, env(pubWith(true, 1n)), { label: 'poor', owner })).rejects.toThrow(/out of Sepolia ETH/)
  })
  it('builds the deployment from the addresses the run recorded', () => {
    const d = deploymentOf({ name: 'acme.eth', owner, operator: owner, data: { orgRegistry: '0x1', teamRegistry: '0x2', orgResolver: '0x3', teamResolver: '0x4', fromBlock: '99' } } as never)
    expect(d).toMatchObject({ orgName: 'acme.eth', teamName: 'team.acme.eth', orgWallet: owner, hrWallet: owner, fromBlock: 99 })
  })
})
