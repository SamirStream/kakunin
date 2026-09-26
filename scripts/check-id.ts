// Read-only end-to-end check: pnpm --filter @kakunin/scripts exec tsx check-id.ts <telegramId|@username> [displayName]
import { chainReader, checkIdentity, type DirectoryEntry } from '@kakunin/core'
import { readFileSync } from 'node:fs'
import { pub, positional } from './_ctx'

const dir: DirectoryEntry[] = JSON.parse(readFileSync(new URL('../demo/directory.json', import.meta.url), 'utf8'))
const [who, displayName] = positional()
const input = /^\d+$/.test(who ?? '') ? { telegramId: who, displayName } : { username: who, displayName }
console.log(JSON.stringify(await checkIdentity(chainReader(pub), input, dir), null, 2))
