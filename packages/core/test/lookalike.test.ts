import { describe, expect, it } from 'vitest'
import { findLookalike, levenshtein, normalizeHandle } from '../src/lookalike'

const members = [
  { id: 'alice', values: ['alice_kakunin', 'Alice Martin'] },
  { id: 'bob', values: ['bob_dev', 'Bob Tanaka'] },
]

describe('normalizeHandle', () => {
  it('folds case, separators, NFKC', () => expect(normalizeHandle('@Alice_K.a-kunin')).toBe(normalizeHandle('alicekakunin')))
  it('maps Cyrillic lookalikes', () => expect(normalizeHandle('аlісе')).toBe(normalizeHandle('alice')))
  it('maps I/l/1 and 0/o and rn/m', () => {
    expect(normalizeHandle('AIice')).toBe(normalizeHandle('alice'))
    expect(normalizeHandle('a1ice')).toBe(normalizeHandle('alice'))
    expect(normalizeHandle('r0rnan')).toBe(normalizeHandle('roman'))
  })
})
describe('levenshtein', () => {
  it('basic', () => { expect(levenshtein('kitten', 'sitting')).toBe(3); expect(levenshtein('', 'abc')).toBe(3) })
})
describe('findLookalike', () => {
  it('flags homoglyph handle', () => expect(findLookalike('аlice_kakunin', members)).toMatchObject({ id: 'alice', value: 'alice_kakunin' }))
  it('flags edit-distance handle', () => expect(findLookalike('alice_kakunn', members)?.id).toBe('alice'))
  it('flags display name variants', () => expect(findLookalike('Alice  Martln', members)?.id).toBe('alice'))
  it('the real handle is NOT a lookalike of itself', () => expect(findLookalike('Alice_Kakunin', members)).toBeNull())
  it('unrelated handles are not flagged', () => expect(findLookalike('satoshi_recruiter', members)).toBeNull())
  it('too-short queries never match', () => expect(findLookalike('bo', members)).toBeNull())
})
