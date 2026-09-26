import { advanceProvision, progressOf, type ProvisionEnv } from '@kakunin/core/provision'
import { limited } from '@/lib/guard'
import { envSigner, json, keySecret, pub, store } from '@/lib/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // one bounded step per call: a batch of transactions and their receipts

// GET: progress of an organisation-creation run. POST: run its next step (idempotent, the browser calls it until done).
// The job id is an unguessable 80-bit token; the response contains no secret (no keys, no sealed key).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await store.getJob((await params).id)
  return job ? json(progressOf(job)) : json({ error: 'not_found' }, 404)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = limited(req, 'org-advance', 60)
  if (blocked) return blocked
  const env: ProvisionEnv = { pub, sponsor: envSigner('ORG_PRIVATE_KEY').account, secret: keySecret(), rpc: process.env.SEPOLIA_RPC_URL }
  const job = await advanceProvision(store, env, (await params).id)
  return job ? json(progressOf(job)) : json({ error: 'not_found' }, 404)
}
