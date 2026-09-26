import { json, store } from '@/lib/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return json({ alerts: store.read().alerts.slice(0, 50) })
}
