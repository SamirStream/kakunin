// Usage: pnpm --filter @kakunin/scripts add-member <label> "<role>" [since=YYYY-MM-DD] [--dry-run]   (sent by HR)
import { addMember, setMemberText } from '@kakunin/core'
import { hrCtx, positional } from './_ctx'

const [label, role, since = new Date().toISOString().slice(0, 10)] = positional()
if (!label || !role) throw new Error('usage: add-member <label> "<role>" [since]')
const hr = hrCtx()
await addMember(hr, label)
await setMemberText(hr, label, 'org.role', role)
await setMemberText(hr, label, 'org.since', since)
