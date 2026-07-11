// src/lib/attendanceGeo.test.ts
import { describe, it, expect } from 'vitest'
import { haversineMeters, mapVerification } from './attendanceGeo'

describe('haversineMeters', () => {
  it('is ~0 for identical points', () => {
    expect(haversineMeters(30.70, 76.71, 30.70, 76.71)).toBeLessThan(1)
  })
  it('computes a known short distance (~111m per 0.001 lat)', () => {
    const d = haversineMeters(30.700, 76.700, 30.701, 76.700)
    expect(d).toBeGreaterThan(100); expect(d).toBeLessThan(125)
  })
})

describe('mapVerification', () => {
  it('verified when similarity >= threshold', () => {
    expect(mapVerification(92, 90)).toBe('verified')
  })
  it('no_match when below threshold', () => {
    expect(mapVerification(80, 90)).toBe('no_match')
  })
  it('unverified when similarity is null (engine/API failure)', () => {
    expect(mapVerification(null, 90)).toBe('unverified')
  })
})
