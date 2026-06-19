import { describe, it, expect } from 'vitest'
import { project, projectDrawdown, isValidScenario, type Scenario } from './projection'

describe('project', () => {
  it('with a 0% rate, the balance is just the contributions (no interest)', () => {
    // 1 year of 100/month, end-of-month, no initial capital.
    const r = project(0, 0, [{ id: 1, years: 1, monthly: 100 }])
    expect(r.horizon).toBe(1)
    expect(r.totalContributed).toBe(1200)
    expect(r.finalValue).toBe(1200)
    expect(r.interest).toBe(0)
    expect(r.multiple).toBe(1)
    // One point for year 0 plus one per simulated year.
    expect(r.data).toHaveLength(2)
    expect(r.data[0]).toEqual({ year: 0, aportado: 0, valor: 0, valorReal: 0 })
  })

  it('deflates to real terms when an inflation rate is given', () => {
    // No interest, no inflation → real equals nominal.
    const flat = project(0, 0, [{ id: 1, years: 1, monthly: 100 }])
    expect(flat.realFinalValue).toBeCloseTo(flat.finalValue, 6)
    // With 10% inflation over 1 year, real value is nominal / 1.10.
    const r = project(0, 0, [{ id: 1, years: 1, monthly: 100 }], 10)
    expect(r.finalValue).toBe(1200) // nominal is untouched
    expect(r.realFinalValue).toBeCloseTo(1200 / 1.1, 6)
    expect(r.data[r.data.length - 1].valorReal).toBeCloseTo(1200 / 1.1, 6)
  })

  it('compounds initial capital monthly (closed-form check)', () => {
    // No contributions: 1000 at 12% annual = 1% monthly over 12 months.
    const r = project(1000, 12, [{ id: 1, years: 1, monthly: 0 }])
    expect(r.totalContributed).toBe(1000)
    expect(r.finalValue).toBeCloseTo(1000 * 1.01 ** 12, 6) // ≈ 1126.83
    expect(r.interest).toBeGreaterThan(0)
    expect(r.multiple).toBeCloseTo(r.finalValue / 1000, 6)
  })

  it('grows the balance beyond contributions when the rate is positive', () => {
    const r = project(0, 7, [{ id: 1, years: 10, monthly: 500 }])
    expect(r.totalContributed).toBe(10 * 12 * 500)
    expect(r.finalValue).toBeGreaterThan(r.totalContributed)
    expect(r.interest).toBeCloseTo(r.finalValue - r.totalContributed, 6)
  })

  it('marks boundaries where the monthly contribution changes', () => {
    const r = project(0, 5, [
      { id: 1, years: 5, monthly: 500 },
      { id: 2, years: 10, monthly: 1000 },
      { id: 3, years: 15, monthly: 2000 },
    ])
    expect(r.horizon).toBe(30)
    expect(r.boundaries).toEqual([5, 15])
    expect(r.data).toHaveLength(31)
  })

  it('ignores fractional/negative years (floored at 0)', () => {
    const r = project(0, 0, [
      { id: 1, years: 2.9, monthly: 100 },
      { id: 2, years: -3, monthly: 100 },
    ])
    expect(r.horizon).toBe(2) // 2.9 -> 2, -3 -> 0
    expect(r.totalContributed).toBe(2 * 12 * 100)
  })
})

describe('projectDrawdown', () => {
  it('with no interest, the balance falls by the income each month until empty', () => {
    // 1200 withdrawn at 100/month, 0% return → lasts exactly 12 months.
    const d = projectDrawdown(1200, 0, 100)
    expect(d.depleted).toBe(true)
    expect(d.sustainable).toBe(false)
    expect(d.monthsLasted).toBe(12)
    expect(d.totalWithdrawn).toBeCloseTo(1200, 6)
    expect(d.data[0]).toEqual({ year: 0, saldo: 1200, retirado: 0 })
    expect(d.data[d.data.length - 1].saldo).toBe(0)
  })

  it('flags income as sustainable when interest covers the withdrawal', () => {
    // 12% annual = 1% monthly. 1% of 100000 = 1000, so 1000/month never depletes.
    const d = projectDrawdown(100000, 12, 1000)
    expect(d.sustainable).toBe(true)
    expect(d.depleted).toBe(false)
    // Balance holds flat (interest exactly offsets the withdrawal).
    expect(d.data[d.data.length - 1].saldo).toBeCloseTo(100000, 4)
  })

  it('lasts longer than the no-interest case when the balance keeps earning', () => {
    const withInterest = projectDrawdown(120000, 6, 2000)
    const withoutInterest = projectDrawdown(120000, 0, 2000)
    expect(withoutInterest.monthsLasted).toBe(60) // 120000 / 2000
    expect(withInterest.monthsLasted).toBeGreaterThan(withoutInterest.monthsLasted)
  })

  it('neither sustainable nor depleted when the income outlasts the horizon', () => {
    // Income just above the sustainable threshold erodes the balance so slowly
    // it does not empty within the cap — must not be reported as depleted.
    const d = projectDrawdown(696329, 5, 3000)
    expect(d.sustainable).toBe(false) // 3000 > monthly interest (~2901)
    expect(d.depleted).toBe(false) // still has a balance at the 60-year cap
    expect(d.monthsLasted).toBe(60 * 12)
    expect(d.data[d.data.length - 1].saldo).toBeGreaterThan(0)
  })

  it('returns an inert result for non-positive inputs', () => {
    expect(projectDrawdown(0, 7, 1000).depleted).toBe(false)
    expect(projectDrawdown(50000, 7, 0).monthsLasted).toBe(0)
    expect(projectDrawdown(0, 7, 1000).data).toHaveLength(1)
  })

  it('depletes faster and escalates the income when inflation-adjusted', () => {
    const flat = projectDrawdown(500000, 6, 4000, 0)
    const adjusted = projectDrawdown(500000, 6, 4000, 4)
    expect(adjusted.monthsLasted).toBeLessThan(flat.monthsLasted)
    // The flat plan keeps a constant income; the adjusted one rises over time.
    expect(flat.finalMonthlyIncome).toBeCloseTo(4000, 6)
    expect(adjusted.finalMonthlyIncome).toBeGreaterThan(4000)
  })

  it('an otherwise-sustainable income is no longer perpetual once inflation escalates it', () => {
    // 1% monthly on 100k covers 1000/month flat, but not a rising one.
    expect(projectDrawdown(100000, 12, 1000, 0).sustainable).toBe(true)
    const adjusted = projectDrawdown(100000, 12, 1000, 3)
    expect(adjusted.sustainable).toBe(false)
    expect(adjusted.depleted).toBe(true)
  })
})

describe('isValidScenario', () => {
  const valid: Scenario = { initial: 0, rate: 7, currency: 'USD', periods: [{ id: 1, years: 5, monthly: 500 }] }

  it('accepts a well-formed scenario', () => {
    expect(isValidScenario(valid)).toBe(true)
  })

  it('accepts an optional drawdown plan but rejects a malformed one', () => {
    expect(isValidScenario({ ...valid, drawdown: { monthlyIncome: 1000, rate: 5 } })).toBe(true)
    expect(isValidScenario({ ...valid, drawdown: { monthlyIncome: 1000, rate: 5, inflationAdjusted: true } })).toBe(true)
    expect(isValidScenario({ ...valid, drawdown: { monthlyIncome: '1000', rate: 5 } })).toBe(false)
  })

  it('accepts an optional inflation rate but rejects a non-number', () => {
    expect(isValidScenario({ ...valid, inflation: 4 })).toBe(true)
    expect(isValidScenario({ ...valid, inflation: '4' })).toBe(false)
  })

  it('rejects malformed or non-object input', () => {
    expect(isValidScenario(null)).toBe(false)
    expect(isValidScenario({})).toBe(false)
    expect(isValidScenario({ ...valid, rate: '7' })).toBe(false)
    expect(isValidScenario({ ...valid, currency: 5 })).toBe(false)
    expect(isValidScenario({ ...valid, periods: [{ id: 1, years: '5', monthly: 500 }] })).toBe(false)
  })
})
