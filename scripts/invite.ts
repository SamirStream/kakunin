// Register a member (sent by HR) and print a one-time Telegram deep link for them.
// Usage: pnpm --filter @kakunin/scripts exec tsx invite.ts <label> "<role>" [since=YYYY-MM-DD]
import { fileURLToPath } from 'node:url'
import { addMember, setMemberText } from '@kakunin/core'
import { createStore } from '@kakunin/core/store'
import { hrCtx, positional } from './_ctx'

const [label, role = 'Member', since = new Date().toISOString().slice(0, 10)] = positional()
if (!label || !/^[a-z0-9-]{1,32}$/.test(label)) throw new Error('usage: invite <label a-z0-9-> "<role>" [since]')
const hr = hrCtx()
await addMember(hr, label)
await setMemberText(hr, label, 'org.role', role)
await setMemberText(hr, label, 'org.since', since)
const store = createStore(fileURLToPath(new URL('../data/store.json', import.meta.url)))
const inv = await store.createInvite(label)
console.log(`\nInvite for ${label}.team.kakunin-demo.eth (single use):\nhttps://t.me/${process.env.TELEGRAM_BOT_USERNAME ?? 'KakuninBot'}?start=${inv.token}`)
