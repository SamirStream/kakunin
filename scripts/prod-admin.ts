// Housekeeping on the CLOUD store before a demo or judging. Needs .env.prod (`npx vercel env pull .env.prod --environment production`).
//   pnpm --filter @kakunin/scripts exec tsx prod-admin.ts clear-alerts [org]     empties an organisation's alert feed (default: the sample org)
//   pnpm --filter @kakunin/scripts exec tsx prod-admin.ts list                   organisations, their owner, alert counts
//   pnpm --filter @kakunin/scripts exec tsx prod-admin.ts hide-org <name.eth>    removes a test organisation from the public directory (the chain keeps it)
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config({ path: fileURLToPath(new URL('../.env.prod', import.meta.url)), quiet: true })
import { UpstashStore } from '@kakunin/core/store'

const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN
if (!url || !token) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN missing: pull .env.prod first')
const store = new UpstashStore(url, token)
const [cmd, arg] = process.argv.slice(2)

if (cmd === 'list') {
  console.log('kakunin-demo.eth (sample):', (await store.alerts(200)).length, 'alerts')
  for (const o of await store.listOrgs()) console.log(o.name, 'owner', o.owner, '|', (await store.forOrg(o.name).alerts(200)).length, 'alerts,', (await store.forOrg(o.name).directory()).length, 'members in directory')
} else if (cmd === 'clear-alerts') {
  const scope = arg ? store.forOrg(arg) : store
  await scope.clearAlerts()
  console.log('cleared alerts of', arg ?? 'kakunin-demo.eth')
} else if (cmd === 'hide-org' && arg) {
  await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(['HDEL', 'kakunin:orgs', arg]) })
  console.log('removed', arg, 'from the directory')
} else console.log('usage: list | clear-alerts [org] | hide-org <name.eth>')
