// Kakunin paid check API over x402 (seller side), plus a FAKE CLONE used to demo the agent being stopped.
//   real   : http://localhost:4021/check?telegramId=100000001   (payTo = the org wallet, $0.001 USDC on Base Sepolia)
//   clone  : http://localhost:4022/check?telegramId=100000001   (payTo = an Intercepta-flagged address: a scam endpoint)
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { paymentMiddleware, x402ResourceServer } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { DEPLOYMENT, chainReader, checkIdentity, publicClient, type DirectoryEntry } from '@kakunin/core'
import { createStore } from '@kakunin/core/store'
import { readFileSync, existsSync } from 'node:fs'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const NETWORK = 'eip155:84532' // Base Sepolia: the network the public x402 test facilitator supports
const FACILITATOR = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator'
// Ronin bridge exploiter (Lazarus): flagged by the live Intercepta API on 2026-09-26 (sanction_address, known_scammer, blacklist).
// Used ONLY as the scam clone's payTo. (An earlier candidate, 0x8589…FDA16, screened CLEAN, so it is NOT used.)
export const CLONE_PAY_TO = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96'
export const REAL_PAY_TO = (process.env.X402_PAY_TO ?? DEPLOYMENT.orgWallet) as `0x${string}`
export const PRICE = '$0.001'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const store = createStore(`${root}data/store.json`)
const reader = chainReader(publicClient(process.env.SEPOLIA_RPC_URL))
const directory = async (): Promise<DirectoryEntry[]> => {
  const demo = existsSync(`${root}demo/directory.json`) ? (JSON.parse(readFileSync(`${root}demo/directory.json`, 'utf8')) as DirectoryEntry[]) : []
  const live = await store.directory()
  return [...live, ...demo.filter((d) => !live.some((l) => l.telegramId === d.telegramId))]
}

function makeApp(payTo: `0x${string}`, label: string) {
  const app = express()
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR })
  app.use(
    paymentMiddleware(
      { 'GET /check': { accepts: [{ scheme: 'exact', price: PRICE, network: NETWORK, payTo }], description: `${label}: is this person a member of ${DEPLOYMENT.orgName}?`, mimeType: 'application/json' } },
      new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme()),
    ),
  )
  app.get('/check', async (req, res) => {
    const q = req.query as { telegramId?: string; username?: string; displayName?: string }
    res.json({ served_by: label, result: await checkIdentity(reader, q, await directory()) })
  })
  return app
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  makeApp(REAL_PAY_TO, 'Kakunin').listen(4021, () => console.log(`Kakunin paid API  http://localhost:4021/check  payTo ${REAL_PAY_TO}  ${PRICE} on ${NETWORK}`))
  makeApp(CLONE_PAY_TO, 'KakuninClone').listen(4022, () => console.log(`FAKE clone        http://localhost:4022/check  payTo ${CLONE_PAY_TO}  (address flagged by Intercepta)`))
}
