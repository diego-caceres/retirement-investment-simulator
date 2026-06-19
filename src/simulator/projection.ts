// Pure compound-interest projection — zero dependencies, no DOM, no React.
// Safe to reuse anywhere (Node, tests, other apps). Monthly compounding,
// contributions applied at the end of each month, constant nominal rate.

export interface Period {
  id: number
  years: number
  monthly: number
}

/** Retirement (drawdown) plan layered on top of the accumulated value. */
export interface DrawdownInput {
  /** Fixed monthly income withdrawn during retirement (at year 0). */
  monthlyIncome: number
  /** Annual nominal return earned on the un-withdrawn balance. */
  rate: number
  /** When true, the income escalates each year with inflation (keeps purchasing power). */
  inflationAdjusted?: boolean
}

export interface Scenario {
  initial: number
  rate: number
  /** Display-only currency code (the math is currency-agnostic). */
  currency: string
  periods: Period[]
  /** Estimated annual inflation %, used for real-terms (today's purchasing power) figures. */
  inflation?: number
  /** Optional retirement plan; absent on scenarios that predate the feature. */
  drawdown?: DrawdownInput
}

/** A scenario the user explicitly saved under a name, to reload later. */
export interface SavedScenario {
  id: string
  name: string
  savedAt: string
  scenario: Scenario
}

export interface Projection {
  horizon: number
  finalValue: number
  /** Final value deflated to year-0 purchasing power (== finalValue when inflation is 0). */
  realFinalValue: number
  totalContributed: number
  interest: number
  multiple: number
  /** Cumulative years where the monthly contribution changes (for ref lines). */
  boundaries: number[]
  data: { year: number; aportado: number; valor: number; valorReal: number }[]
}

/**
 * Projects a tranche-based monthly-contribution plan with monthly compounding.
 * When `inflationPct` is given, each point is also deflated to year-0 purchasing
 * power (`valorReal`) — nominal figures are left untouched.
 */
export function project(
  initial: number,
  ratePct: number,
  periods: Period[],
  inflationPct = 0,
): Projection {
  const mr = ratePct / 100 / 12
  const yi = inflationPct / 100
  // Deflator from year y back to today's purchasing power.
  const real = (nominal: number, year: number) => nominal / Math.pow(1 + yi, year)
  // Flatten periods into a per-month contribution schedule.
  const monthlyByMonth: number[] = []
  const boundaries: number[] = []
  let cumYears = 0
  for (const p of periods) {
    const yrs = Math.max(0, Math.floor(p.years))
    if (cumYears > 0) boundaries.push(cumYears)
    for (let i = 0; i < yrs * 12; i++) monthlyByMonth.push(p.monthly)
    cumYears += yrs
  }
  const horizon = cumYears

  let balance = initial
  let contributed = initial
  const data: Projection['data'] = [{ year: 0, aportado: initial, valor: initial, valorReal: initial }]

  for (let y = 0; y < horizon; y++) {
    for (let mo = 0; mo < 12; mo++) {
      const pmt = monthlyByMonth[y * 12 + mo] ?? 0
      balance = balance * (1 + mr) + pmt
      contributed += pmt
    }
    data.push({ year: y + 1, aportado: contributed, valor: balance, valorReal: real(balance, y + 1) })
  }

  return {
    horizon,
    finalValue: balance,
    realFinalValue: real(balance, horizon),
    totalContributed: contributed,
    interest: balance - contributed,
    multiple: contributed > 0 ? balance / contributed : 0,
    boundaries,
    data,
  }
}

export interface Drawdown {
  startValue: number
  /** Initial (year-0) monthly income. */
  monthlyIncome: number
  /** Last monthly income paid — equals `monthlyIncome` unless inflation-adjusted. */
  finalMonthlyIncome: number
  rate: number
  /** True when interest on the balance covers the withdrawal — income never ends. */
  sustainable: boolean
  /** True when the account reaches zero within the projected horizon. */
  depleted: boolean
  /** Whole months the income lasted (meaningful only when `depleted`). */
  monthsLasted: number
  totalWithdrawn: number
  data: { year: number; saldo: number; retirado: number }[]
}

/** Horizon cap for the drawdown projection — beyond this we report "+N years". */
export const DRAWDOWN_MAX_YEARS = 60

/**
 * Projects a monthly drawdown ("jubilación") against an accumulated balance.
 * Each month the balance earns interest, then the income is withdrawn. When
 * `inflationPct` is positive the income escalates once a year to preserve
 * purchasing power, which makes the capital deplete faster. With a flat income
 * (inflation 0) that already covered by interest, the balance never falls
 * (`sustainable`); otherwise it erodes until empty — the final month withdraws
 * only what remains.
 */
export function projectDrawdown(
  startValue: number,
  ratePct: number,
  monthlyIncome: number,
  inflationPct = 0,
  maxYears = DRAWDOWN_MAX_YEARS,
): Drawdown {
  const mr = ratePct / 100 / 12
  const yi = Math.max(0, inflationPct) / 100
  const income0 = Math.max(0, monthlyIncome)
  const start = Math.max(0, startValue)
  const maxMonths = Math.max(0, Math.floor(maxYears)) * 12
  const data: Drawdown['data'] = [{ year: 0, saldo: start, retirado: 0 }]
  const base = { startValue: start, monthlyIncome: income0, rate: ratePct }

  if (income0 <= 0 || start <= 0) {
    return { ...base, finalMonthlyIncome: income0, sustainable: false, depleted: false, monthsLasted: 0, totalWithdrawn: 0, data }
  }

  // The income at month m (escalates annually with inflation when yi > 0).
  const incomeAt = (m: number) => income0 * Math.pow(1 + yi, Math.floor((m - 1) / 12))
  // Only a flat income covered by interest is truly perpetual; an escalating one
  // eventually outpaces any fixed return.
  const sustainable = yi === 0 && income0 <= start * mr
  let balance = start
  let withdrawn = 0
  let months = 0
  let lastIncome = income0
  let depleted = false

  for (let m = 1; m <= maxMonths; m++) {
    const income = incomeAt(m)
    const grown = balance * (1 + mr)
    if (!sustainable && grown <= income) {
      // The last, partial withdrawal empties the account this month.
      withdrawn += grown
      lastIncome = income
      balance = 0
      months = m
      depleted = true
      data.push({ year: Math.round((m / 12) * 10) / 10, saldo: 0, retirado: withdrawn })
      break
    }
    balance = grown - income
    withdrawn += income
    lastIncome = income
    months = m
    if (m % 12 === 0) data.push({ year: m / 12, saldo: balance, retirado: withdrawn })
  }

  return {
    ...base,
    finalMonthlyIncome: lastIncome,
    sustainable,
    depleted,
    monthsLasted: months,
    totalWithdrawn: withdrawn,
    data,
  }
}

/** Structural validation for data coming from localStorage / external sources. */
export function isValidScenario(s: unknown): s is Scenario {
  const c = s as Scenario
  const base =
    typeof c?.initial === 'number' &&
    typeof c?.rate === 'number' &&
    typeof c?.currency === 'string' &&
    Array.isArray(c?.periods) &&
    c.periods.every(p => typeof p?.years === 'number' && typeof p?.monthly === 'number')
  if (!base) return false
  // Inflation is optional; reject only a present-but-wrong-typed value.
  if (c.inflation !== undefined && typeof c.inflation !== 'number') return false
  // The drawdown plan is optional; validate it only when present.
  if (c.drawdown === undefined) return true
  return (
    typeof c.drawdown?.monthlyIncome === 'number' &&
    typeof c.drawdown?.rate === 'number' &&
    (c.drawdown.inflationAdjusted === undefined || typeof c.drawdown.inflationAdjusted === 'boolean')
  )
}

/** Best-effort unique id, falling back when crypto.randomUUID is unavailable. */
export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(36).slice(2)
}
