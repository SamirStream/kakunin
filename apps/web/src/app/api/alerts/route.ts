import { json, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return json({ alerts: await store.alerts(50) })
}
