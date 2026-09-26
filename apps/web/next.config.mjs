import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

// Server env (RPC URL, bot username, optional demo signer keys) lives in the repo-root .env
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })

/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@kakunin/core'],
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
}
