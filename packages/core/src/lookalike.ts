// Lookalike detection for handles / display names: NFKC + case fold + confusable map + Levenshtein.
// Pure and dependency-free so it runs identically in the bot, the web app and the tests.

// Cyrillic/Greek/other glyphs that render like Latin letters.
const CONFUSABLES: Record<string, string> = {
  а: 'a', в: 'b', с: 'c', ԁ: 'd', е: 'e', ғ: 'f', ɡ: 'g', һ: 'h', і: 'i', ј: 'j', к: 'k', ӏ: 'l', м: 'm', н: 'h', о: 'o',
  р: 'p', ԛ: 'q', г: 'r', ѕ: 's', т: 't', υ: 'u', ѵ: 'v', ԝ: 'w', х: 'x', у: 'y', ᴢ: 'z',
  α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', χ: 'x', ω: 'w',
  '0': 'o', '1': 'l', '|': 'l', '3': 'e', '5': 's', $: 's',
}

export function normalizeHandle(input: string): string {
  // Uppercase I is visually identical to lowercase l in many fonts: map it BEFORE case folding.
  let s = input.normalize('NFKC').replace(/I/g, 'l').toLowerCase()
  s = s.replace(/^@/, '').replace(/[\s_.\-]/g, '')
  s = [...s].map((ch) => CONFUSABLES[ch] ?? ch).join('')
  return s.replace(/rn/g, 'm').replace(/vv/g, 'w')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

export interface LookalikeCandidate { id: string; values: string[] }
export interface LookalikeMatch { id: string; value: string; distance: number }

const plain = (s: string) => s.normalize('NFKC').toLowerCase().replace(/^@/, '')

/**
 * Best candidate that `query` imitates, or null. A query that is EXACTLY (case-insensitively) one of a candidate's
 * values is that candidate, not a lookalike. Threshold: distance <= 2 (<= 1 for normalized strings of <= 4 chars,
 * to avoid flagging unrelated short names).
 */
export function findLookalike(query: string, candidates: LookalikeCandidate[]): LookalikeMatch | null {
  const q = normalizeHandle(query)
  if (q.length < 3) return null
  let best: LookalikeMatch | null = null
  for (const c of candidates) {
    for (const value of c.values) {
      if (!value || plain(value) === plain(query)) continue
      const v = normalizeHandle(value)
      const distance = levenshtein(q, v)
      const max = Math.min(q.length, v.length) <= 4 ? 1 : 2
      if (distance <= max && (!best || distance < best.distance)) best = { id: c.id, value, distance }
    }
  }
  return best
}
