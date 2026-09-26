// Builds `.env.vercel` (gitignored) with exactly the variables the cloud deployment needs, taken from your local .env, so you can
// use Vercel > Settings > Environment Variables > "Import .env" instead of copying secrets by hand. Prints NAMES only, never values.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
config({ path: envPath, quiet: true })
const out = fileURLToPath(new URL('../.env.vercel', import.meta.url))

const secret = () => randomBytes(18).toString('base64url')
// TELEGRAM_WEBHOOK_SECRET must be identical in .env (used by `pnpm webhook:set`) and in Vercel.
if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
  process.env.TELEGRAM_WEBHOOK_SECRET = secret()
  const cur = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  writeFileSync(envPath, `${cur.trimEnd()}\n\n# Telegram webhook secret (same value in the Vercel env)\nTELEGRAM_WEBHOOK_SECRET=${process.env.TELEGRAM_WEBHOOK_SECRET}\n`)
}

const copy = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET', 'ADMIN_SECRET', 'ORG_PRIVATE_KEY', 'HR_PRIVATE_KEY', 'AGENT_PRIVATE_KEY',
  'INTERCEPTA_API_KEY', 'DEMO_ADMIN_TOKEN', 'SEPOLIA_RPC_URL', 'X402_PAY_TO']
const fixed: Record<string, string> = {
  KAKUNIN_DEMO_SIGNER: '1', // lets the presenter revoke/reset with the admin token; refused without it
  KAKUNIN_AGENT_PUBLIC: '1', // anyone can run the agent demo, rate limited (3 / 10 min per client, 150 / day)
}
const lines: string[] = []
const missing: string[] = []
for (const k of copy) {
  const v = process.env[k]
  if (v && v !== 'placeholder' && v !== 'change-me') lines.push(`${k}=${v}`)
  else if (k !== 'X402_PAY_TO' && k !== 'SEPOLIA_RPC_URL') missing.push(k)
}
for (const [k, v] of Object.entries(fixed)) lines.push(`${k}=${v}`)
writeFileSync(out, lines.join('\n') + '\n')
console.log(`Wrote .env.vercel with ${lines.length} variables (gitignored):`)
console.log('  ' + lines.map((l) => l.split('=')[0]).join(', '))
if (missing.length) console.log(`MISSING in your .env (cloud features that need them will not work): ${missing.join(', ')}`)
console.log('\nNext: Vercel > Project > Settings > Environment Variables > Import .env (paste the file), then add the Upstash Redis integration and redeploy. Delete .env.vercel afterwards.')
