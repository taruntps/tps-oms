import { describe, it, expect } from 'vitest'
import { similarity, isMatch } from './faceEngine'

const a = [0.1, 0.2, 0.3, 0.4]
const aSame = [0.1, 0.2, 0.3, 0.4]
const b = [-0.4, -0.3, 0.9, 0.1]

describe('similarity', () => {
  it('returns ~1 for identical descriptors', () => {
    expect(similarity(a, aSame)).toBeGreaterThan(0.99)
  })
  it('returns lower for different descriptors', () => {
    expect(similarity(a, b)).toBeLessThan(similarity(a, aSame))
  })
  it('returns 0 for mismatched lengths', () => {
    expect(similarity(a, [0.1, 0.2])).toBe(0)
  })
})

describe('isMatch', () => {
  it('passes when similarity >= threshold', () => {
    expect(isMatch(a, aSame, 0.5)).toBe(true)
  })
  it('fails when similarity < threshold', () => {
    expect(isMatch(a, b, 0.99)).toBe(false)
  })
})
