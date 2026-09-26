// Copies the local store (data/store.json: Telegram directory, admin chats) into Upstash Redis, so switching the bot to the cloud
// keeps the @username directory and the /subscribe admin chat. Alerts are demo noise and are NOT copied. Prints counts only.
//   pnpm --filter @kakunin/scripts exec tsx migrate-store.ts <env-file-with-KV_REST_API_URL-and-TOKEN>
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { JsonStore, UpstashStore } from '@kakunin/core/store'

const envFile = process.argv[2]
if (envFile) config({ path: envFile, quiet: true })
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
if (!url || !token) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN not found (pass the pulled env file as the first argument)')

const local = new JsonStore(fileURLToPath(new URL('../data/store.json', import.meta.url)))
const remote = new UpstashStore(url, token)
const dir = await local.directory()
const admins = await local.adminChats()
for (const e of dir) await remote.upsertMember(e)
for (const c of admins) await remote.addOrgAdminChat(c)
console.log(`migrated ${dir.length} directory entr${dir.length === 1 ? 'y' : 'ies'} and ${admins.length} admin chat(s) to Upstash`)
console.log(`remote now holds ${(await remote.directory()).length} directory entries and ${(await remote.adminChats()).length} admin chats`)
