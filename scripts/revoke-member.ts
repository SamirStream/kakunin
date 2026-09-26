// Usage: pnpm --filter @kakunin/scripts revoke-member <label> [--dry-run]   (sent by HR)
import { revokeMember } from '@kakunin/core'
import { hrCtx, positional } from './_ctx'

const [label] = positional()
if (!label) throw new Error('usage: revoke-member <label>')
console.log((await revokeMember(hrCtx(), label)).skipped ? `${label}: not an active member, nothing to do` : `${label}: revoked`)
