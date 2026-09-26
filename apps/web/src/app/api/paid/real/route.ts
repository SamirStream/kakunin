import { NextRequest, NextResponse } from 'next/server'
import { withX402 } from '@x402/next'
import { REAL_PAY_TO, paidCheck, routeConfig, x402Server } from '@/lib/x402'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/paid/real?telegramId=100000001 : Kakunin's check, paid per call over x402 (0.001 USDC, Base Sepolia).
// withX402 settles the payment only after a successful response.
export const GET = withX402(
  async (req: NextRequest) => NextResponse.json(await paidCheck(req, 'Kakunin')),
  routeConfig('/api/paid/real', REAL_PAY_TO, 'Kakunin'),
  x402Server,
)
