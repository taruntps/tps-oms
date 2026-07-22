// HRMS M4 — Payroll engine unit tests (pure, deterministic, bigint paise).
// Maps the Payroll Test Scenario Matrix (PAY-CALC-*, PAY-ST-*, PAY-AT-06): rounding half-up,
// percent-of-base, balancing, LOP proration, PT slab, LOP-from-attendance, basis days.
import { describe, it, expect } from 'vitest'
import {
  divRoundHalfUp, percentOf, roundToRupee, roundNet,
  computeComponents, applyLop, resolveSlab,
  daysInMonth, basisDaysFor, lopDaysFromAttendance,
  type ComponentDef, type EngineComponent, type Paise,
} from './api/payroll'

const def = (p: Partial<ComponentDef> & { code: string }): ComponentDef => ({
  name: p.code, type: 'earning', calc_type: 'fixed', base_code: null,
  is_taxable: true, is_pf_wage: false, is_esi_wage: false,
  is_part_of_gross: true, prorate_on_lop: true, sort_order: 0, ...p,
})

describe('payroll money math (paise, half-up)', () => {
  it('PAY-CALC-04 divRoundHalfUp rounds .5 away from zero', () => {
    expect(divRoundHalfUp(150n, 100n)).toBe(2n)   // 1.5 → 2
    expect(divRoundHalfUp(149n, 100n)).toBe(1n)   // 1.49 → 1
    expect(divRoundHalfUp(250n, 100n)).toBe(3n)   // 2.5 → 3
    expect(divRoundHalfUp(-150n, 100n)).toBe(-2n)
    expect(divRoundHalfUp(5n, 0n)).toBe(0n)        // guard
  })
  it('PAY-CALC-02 percentOf exact (incl. fractional 8.33%)', () => {
    expect(percentOf(100000n, 50)).toBe(50000n)    // 50% of ₹1000 = ₹500
    expect(percentOf(100000n, 12)).toBe(12000n)    // PF 12%
    expect(percentOf(100000n, 8.33)).toBe(8330n)   // ₹83.30 (no float drift)
    expect(percentOf(100000n, 0)).toBe(0n)
  })
  it('PAY-CALC-04 roundToRupee + roundNet carry', () => {
    expect(roundToRupee(12345n)).toBe(12300n)      // ₹123.45 → ₹123
    expect(roundToRupee(12350n)).toBe(12400n)      // ₹123.50 → ₹124
    expect(roundNet(12345n)).toEqual({ net: 12300n, roundOff: 45n })
  })
})

describe('component resolution (Calc-Spec §11 precedence)', () => {
  it('PAY-CALC-01 fixed → percent-of-base → balancing sums to gross', () => {
    const gross = 1_000_000n // ₹10,000
    const comps: EngineComponent[] = [
      { def: def({ code: 'BASIC', calc_type: 'percent_of_base', base_code: 'GROSS', sort_order: 1 }), percent: 50 },
      { def: def({ code: 'HRA', calc_type: 'percent_of_base', base_code: 'BASIC', sort_order: 2 }), percent: 40 },
      { def: def({ code: 'SPECIAL', calc_type: 'balancing', sort_order: 4 }) },
    ]
    const r = computeComponents(comps, gross)
    expect(r.get('BASIC')).toBe(500_000n)          // 50% of gross
    expect(r.get('HRA')).toBe(200_000n)            // 40% of Basic
    expect(r.get('SPECIAL')).toBe(300_000n)        // balancing
    const sum = [...r.values()].reduce((s, v) => s + v, 0n)
    expect(sum).toBe(gross)                        // PAY-CALC-03 Σ = gross
  })
})

describe('LOP proration (Calc-Spec §5)', () => {
  it('PAY-AT-02 prorates flagged components; leaves non-flagged untouched', () => {
    const earnings = new Map<string, Paise>([['BASIC', 500_000n], ['FIXEDR', 100_000n]])
    const defs = new Map<string, ComponentDef>([
      ['BASIC', def({ code: 'BASIC', prorate_on_lop: true })],
      ['FIXEDR', def({ code: 'FIXEDR', prorate_on_lop: false })],
    ])
    const out = applyLop(earnings, defs, 2, 30) // 2 LOP days on a 30-day basis
    expect(out.get('BASIC')).toBe(466_667n)        // 500000 − round(500000×2/30)
    expect(out.get('FIXEDR')).toBe(100_000n)       // untouched
    expect(applyLop(earnings, defs, 0, 30).get('BASIC')).toBe(500_000n) // no LOP → unchanged
  })
})

describe('statutory slab + attendance/basis helpers', () => {
  it('PAY-ST-03 resolveSlab picks the matching band (empty → 0)', () => {
    const slabs = [{ min: 0, max: 1_000_000, amount: 20_000 }]
    expect(resolveSlab(slabs, 500_000n)).toBe(20_000n)
    expect(resolveSlab([], 500_000n)).toBe(0n)     // placeholder → no PT
  })
  it('PAY-AT-06 basis days from policy; PAY-AT-02 LOP from attendance', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(basisDaysFor({ lopBasis: 'calendar' } as any, 2026, 2)).toBe(28)
    expect(basisDaysFor({ lopBasis: '30' } as any, 2026, 2)).toBe(30)
    expect(lopDaysFromAttendance([{ status: 'absent' }, { status: 'half_day' }, { status: 'present' }])).toBe(1.5)
  })
})
