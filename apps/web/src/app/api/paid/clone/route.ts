import { NextRequest, NextResponse } from 'next/server'
import { withX402 } from '@x402/next'
import { CLONE_PAY_TO, paidCheck, routeConfig, x402Server } from '@/lib/x402'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// A FAKE clone of the paid API whose payTo is an Intercepta-flagged address. The demo agent must refuse to pay it.
export const GET = withX402(
  async (req: NextRequest) => NextResponse.json(await paidCheck(req, 'KakuninClone')),
  routeConfig('/api/paid/clone', CLONE_PAY_TO, 'KakuninClone'),
  x402Server,
)
