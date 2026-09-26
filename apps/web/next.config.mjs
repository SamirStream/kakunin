import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

// Server env (RPC URL, bot username, optional demo signer keys) lives in the repo-root .env
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })

// Baseline hardening for every response (no CSP: Next injects inline scripts; a wrong CSP would break the app).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@kakunin/core', '@kakunin/paid-api', '@kakunin/bot'],
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
