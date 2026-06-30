import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Legend, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  DRAWDOWN_MAX_YEARS, isValidScenario, newId, project, projectDrawdown,
  type Period, type Scenario, type SavedScenario,
} from './projection'
import {
  loadSavedScenarios, loadScenario, mergeSavedScenarios,
  persistSavedScenarios, saveScenario, setActiveStorage,
} from './storage'
import { getSharedLocalStorage, inCrossOriginIframe } from './crossSiteSync'
import './Simulator.css'

// Series colors (kept local so the component carries no app dependencies).
const SERIES = { contributed: '#7fa9c6', market: '#67c195', withdrawn: '#d8a25e', real: '#a99bc4' }

// Editable form fields are raw strings (so they can be blanked while typing);
// they're parsed to numbers for the projection.
type PeriodInput = { id: number; years: string; monthly: string }

const DEFAULT_CURRENCIES = ['USD', 'UYU', 'UYI']
const DEFAULT_PERIODS: Period[] = [
  { id: 1, years: 5, monthly: 500 },
  { id: 2, years: 10, monthly: 1000 },
  { id: 3, years: 15, monthly: 2000 },
]
const DEFAULT_SCENARIO: Scenario = { initial: 0, rate: 7, currency: 'USD', periods: DEFAULT_PERIODS }
const DEFAULT_STORAGE = { last: 'simulator-scenario-v1', saved: 'simulator-saved-scenarios-v1' }

export interface SimulatorProps {
  /** Menu-less, centered full-page shell (e.g. a public route). */
  standalone?: boolean
  /** Selectable currency codes (display only). Defaults to USD/UYU/UYI. */
  currencies?: readonly string[]
  /** Scenario shown on first load when nothing is persisted. */
  defaultScenario?: Scenario
  /** Locale for number formatting. Defaults to 'es-UY'. */
  locale?: string
  /** localStorage keys; pass null to disable persistence entirely. */
  storageKeys?: { last: string; saved: string } | null
  /** Href for the "open full screen" link; hidden when standalone or null. */
  fullScreenHref?: string | null
}

// Parse a form field to a number, treating empty / invalid input as 0.
function num(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

export default function Simulator({
  standalone = false,
  currencies = DEFAULT_CURRENCIES,
  defaultScenario = DEFAULT_SCENARIO,
  locale = 'es-UY',
  storageKeys = DEFAULT_STORAGE,
  fullScreenHref = '/sim',
}: SimulatorProps = {}) {
  // Seed once: from storage if enabled, else the default scenario.
  const seed = useMemo(
    () => (storageKeys ? loadScenario(storageKeys.last, defaultScenario) : defaultScenario),
    // Seeding intentionally runs only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // Per-instance id counter for new periods (no module-level shared state).
  const nextId = useRef(Math.max(0, ...seed.periods.map(p => p.id)) + 1)

  const [initial, setInitial] = useState(String(seed.initial))
  const [rate, setRate] = useState(seed.rate)
  const [currency, setCurrency] = useState(seed.currency)
  const [periods, setPeriods] = useState<PeriodInput[]>(
    seed.periods.map(p => ({ id: p.id, years: String(p.years), monthly: String(p.monthly) })),
  )
  const [saved, setSaved] = useState<SavedScenario[]>(
    () => (storageKeys ? loadSavedScenarios(storageKeys.saved) : []),
  )
  const [scenarioName, setScenarioName] = useState('')

  // --- Cross-site sync ----------------------------------------------------
  // When embedded in a cross-origin iframe, saved scenarios live in a store
  // partitioned per embedding site. The Storage Access API can grant access to
  // this origin's shared (unpartitioned) store so every embed + direct visit
  // see the same scenarios. Status drives a small affordance in the drawer.
  // 'na' = not framed / persistence off (nothing to sync, no UI).
  const framed = useMemo(() => storageKeys != null && inCrossOriginIframe(), [storageKeys])
  const [syncStatus, setSyncStatus] = useState<'na' | 'idle' | 'syncing' | 'on' | 'unsupported'>(
    () => (storageKeys != null && inCrossOriginIframe() ? 'idle' : 'na'),
  )

  // Adopt the shared store: switch the storage layer to it, merge whatever was
  // saved locally (partitioned) with what's already shared, and re-render.
  function adoptSharedStore(shared: Storage) {
    if (!storageKeys) return
    const local = loadSavedScenarios(storageKeys.saved) // still the partitioned store
    setActiveStorage(shared)
    const remote = loadSavedScenarios(storageKeys.saved) // now reads the shared store
    const merged = mergeSavedScenarios(remote, local)
    persistSavedScenarios(storageKeys.saved, merged)
    setSaved(merged)
    setSyncStatus('on')
  }

  // On mount, try to upgrade silently — succeeds only if the permission was
  // already granted, so no prompt appears. Otherwise we wait for a click.
  useEffect(() => {
    if (!framed) return
    let cancelled = false
    getSharedLocalStorage().then(shared => {
      if (!cancelled && shared) adoptSharedStore(shared)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framed])

  // Triggered by a user gesture (button click), which the browser requires to
  // prompt for / grant storage access.
  async function enableSync() {
    setSyncStatus('syncing')
    const shared = await getSharedLocalStorage()
    if (shared) adoptSharedStore(shared)
    else setSyncStatus('unsupported')
  }

  // Estimated annual inflation, for real-terms (today's purchasing power) figures.
  const [inflation, setInflation] = useState(seed.inflation ?? 3)

  // Retirement (drawdown) plan: starts from the accumulated value above.
  const [monthlyIncome, setMonthlyIncome] = useState(String(seed.drawdown?.monthlyIncome ?? 0))
  const [retireRate, setRetireRate] = useState(seed.drawdown?.rate ?? seed.rate)
  const [inflationAdjusted, setInflationAdjusted] = useState(seed.drawdown?.inflationAdjusted ?? false)

  // Collapsible UI: retirement section and the saved-scenarios side drawer.
  const [retireOpen, setRetireOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const parsedPeriods = useMemo<Period[]>(
    () => periods.map(p => ({ id: p.id, years: num(p.years), monthly: num(p.monthly) })),
    [periods],
  )
  const parsedInitial = num(initial)

  const parsedIncome = num(monthlyIncome)

  // Assemble the full working scenario (used for both persistence and saving).
  const workingScenario = useMemo<Scenario>(
    () => ({
      initial: parsedInitial,
      rate,
      currency,
      periods: parsedPeriods,
      inflation,
      drawdown: { monthlyIncome: parsedIncome, rate: retireRate, inflationAdjusted },
    }),
    [parsedInitial, rate, currency, parsedPeriods, inflation, parsedIncome, retireRate, inflationAdjusted],
  )

  // Persist the working scenario on every change so a reload restores it.
  useEffect(() => {
    if (!storageKeys) return
    saveScenario(storageKeys.last, workingScenario)
  }, [workingScenario, storageKeys])

  const m = useMemo(
    () => project(parsedInitial, rate, parsedPeriods, inflation),
    [parsedInitial, rate, parsedPeriods, inflation],
  )

  // Retirement projection: how long the accumulated value lasts as an income.
  // When inflation-adjusted, the withdrawal escalates yearly with inflation.
  const d = useMemo(
    () => projectDrawdown(m.finalValue, retireRate, parsedIncome, inflationAdjusted ? inflation : 0),
    [m.finalValue, retireRate, parsedIncome, inflationAdjusted, inflation],
  )

  function updatePeriod(id: number, patch: Partial<PeriodInput>) {
    setPeriods(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)))
  }
  function addPeriod() {
    setPeriods(ps => [...ps, { id: nextId.current++, years: '5', monthly: '1000' }])
  }
  function removePeriod(id: number) {
    setPeriods(ps => (ps.length > 1 ? ps.filter(p => p.id !== id) : ps))
  }

  // Save current inputs under a name; re-saving an existing name overwrites it.
  function saveCurrentScenario() {
    const name = scenarioName.trim()
    if (!name) return
    const scenario: Scenario = workingScenario
    setSaved(prev => {
      const idx = prev.findIndex(s => s.name.toLowerCase() === name.toLowerCase())
      const entry: SavedScenario = {
        id: idx >= 0 ? prev[idx].id : newId(),
        name,
        savedAt: new Date().toISOString(),
        scenario,
      }
      const next = idx >= 0 ? prev.map((s, i) => (i === idx ? entry : s)) : [...prev, entry]
      if (storageKeys) persistSavedScenarios(storageKeys.saved, next)
      return next
    })
    setScenarioName('')
  }

  function loadSavedScenario(s: SavedScenario) {
    if (!isValidScenario(s.scenario)) return
    const sc = s.scenario
    setInitial(String(sc.initial))
    setRate(sc.rate)
    setCurrency(sc.currency)
    setPeriods(sc.periods.map(p => ({ id: p.id, years: String(p.years), monthly: String(p.monthly) })))
    nextId.current = Math.max(nextId.current, ...sc.periods.map(p => p.id)) + 1
    setScenarioName(s.name)
    if (sc.inflation !== undefined) setInflation(sc.inflation)
    if (sc.drawdown) {
      setMonthlyIncome(String(sc.drawdown.monthlyIncome))
      setRetireRate(sc.drawdown.rate)
      setInflationAdjusted(sc.drawdown.inflationAdjusted ?? false)
    }
  }

  function deleteSavedScenario(id: string) {
    setSaved(prev => {
      const next = prev.filter(s => s.id !== id)
      if (storageKeys) persistSavedScenarios(storageKeys.saved, next)
      return next
    })
  }

  const fmt = (n: number) => Math.round(n).toLocaleString(locale, { maximumFractionDigits: 0 })
  const money = (n: number) => `${currency} ${fmt(n)}`
  // "X años y Y meses" from a whole-month count (Spanish, with singular/plural).
  const fmtDuration = (totalMonths: number) => {
    const yrs = Math.floor(totalMonths / 12)
    const mos = totalMonths % 12
    const parts: string[] = []
    if (yrs > 0) parts.push(`${yrs} año${yrs !== 1 ? 's' : ''}`)
    if (mos > 0) parts.push(`${mos} mes${mos !== 1 ? 'es' : ''}`)
    return parts.length ? parts.join(' y ') : '0 meses'
  }
  // The select must always include the active currency, even if not in the list.
  const currencyOptions = useMemo(
    () => [...new Set([...currencies, currency])],
    [currencies, currency],
  )

  const body = (
    <div>
      <div className="sim-header">
        <div>
          <h1>Simulador</h1>
          <p className="sim-note" style={{ maxWidth: '80ch', marginTop: '0.5rem' }}>
            Interés compuesto por tramos. Definí un horizonte como una sucesión de
            períodos, cada uno con su aporte mensual — por ejemplo 5 años aportando 500,
            luego 10 a 1.000 y un tramo final a 2.000.
          </p>
          <p>
            Esto es un escenario teórico, no un asesoramiento financiero.
          </p>
        </div>
        <div className="sim-header-actions">
          <button
            type="button" className="sim-btn sim-btn-secondary"
            aria-expanded={panelOpen} onClick={() => setPanelOpen(o => !o)}
          >
            Escenarios guardados
            {saved.length > 0 && <span className="sim-badge">{saved.length}</span>}
          </button>
          {!standalone && fullScreenHref && (
            <a className="sim-btn sim-btn-secondary" href={fullScreenHref} target="_blank" rel="noopener noreferrer">
              Abrir en pantalla completa ↗
            </a>
          )}
        </div>
      </div>

      <div className="sim-layout">
        {/* ---------------------------------------------------- Controles */}
        <div className="sim-card" style={{ alignSelf: 'start' }}>
          <div className="sim-field">
            <label>Capital inicial</label>
            <div className="sim-affix">
              <span className="sim-affix-label">{currency}</span>
              <input
                type="number" step="1000" inputMode="numeric" placeholder="0" value={initial}
                onChange={e => setInitial(e.target.value)}
              />
            </div>
          </div>

          <div className="sim-field">
            <label>Moneda</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}>
              {currencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="sim-field">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Rendimiento anual</span>
              <span style={{ color: 'var(--_accent)', fontVariantNumeric: 'tabular-nums' }}>{rate}%</span>
            </label>
            <input
              className="sim-range" type="range" min="0" max="15" step="0.5"
              value={rate} onChange={e => setRate(Number(e.target.value))}
            />
          </div>

          <div className="sim-field" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Inflación anual estimada</span>
              <span style={{ color: 'var(--_accent)', fontVariantNumeric: 'tabular-nums' }}>{inflation}%</span>
            </label>
            <input
              className="sim-range" type="range" min="0" max="15" step="0.5"
              value={inflation} onChange={e => setInflation(Number(e.target.value))}
            />
            <p className="sim-hint">
              {currency === 'UYI'
                ? 'La UYI ya ajusta por inflación: dejá esto en 0 para no descontarla dos veces.'
                : 'Para leer los montos en poder de compra de hoy.'}
            </p>
          </div>

          <div className="sim-divider" />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.6rem' }}>
            <div className="sim-title" style={{ margin: 0 }}>Tramos de aporte</div>
            <button type="button" className="sim-btn sim-btn-secondary sim-btn-sm" onClick={addPeriod}>+ Tramo</button>
          </div>

          {periods.map((p, i) => {
            const from = periods.slice(0, i).reduce((s, q) => s + Math.max(0, Math.floor(num(q.years))), 0)
            const to = from + Math.max(0, Math.floor(num(p.years)))
            return (
              <div className="sim-period" key={p.id}>
                <div className="sim-period-head">
                  <span className="sim-period-idx">Tramo {i + 1}</span>
                  <span className="sim-period-range">años {from}–{to}</span>
                  {periods.length > 1 && (
                    <button
                      type="button" className="sim-period-x" aria-label="Quitar tramo"
                      onClick={() => removePeriod(p.id)}
                    >×</button>
                  )}
                </div>
                <div className="sim-period-fields">
                  <div className="sim-field">
                    <label>Años</label>
                    <input
                      type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={p.years}
                      onChange={e => updatePeriod(p.id, { years: e.target.value })}
                    />
                  </div>
                  <div className="sim-field">
                    <label>Aporte mensual</label>
                    <div className="sim-affix">
                      <span className="sim-affix-label">{currency}</span>
                      <input
                        type="number" min="0" step="100" inputMode="numeric" placeholder="0" value={p.monthly}
                        onChange={e => updatePeriod(p.id, { monthly: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ---------------------------------------------------- Resultados */}
        <div>
          <div className="sim-card-grid" style={{ marginBottom: '1.1rem' }}>
            <div className="sim-card">
              <div className="sim-stat-label">Valor final · {m.horizon} años</div>
              <div className="sim-stat-value sim-accent">{money(m.finalValue)}</div>
              {inflation > 0 && (
                <div className="sim-stat-sub">≈ {money(m.realFinalValue)} en poder de compra de hoy</div>
              )}
            </div>
            <div className="sim-card">
              <div className="sim-stat-label">Total aportado</div>
              <div className="sim-stat-value">{money(m.totalContributed)}</div>
              <div className="sim-stat-sub">incluye capital inicial</div>
            </div>
            <div className="sim-card">
              <div className="sim-stat-label">Interés ganado</div>
              <div className="sim-stat-value sim-pos">{money(m.interest)}</div>
              <div className="sim-stat-sub">
                {m.totalContributed > 0
                  ? `${((m.interest / m.totalContributed) * 100).toFixed(0)}% sobre lo aportado`
                  : '—'}
              </div>
            </div>
            <div className="sim-card">
              <div className="sim-stat-label">Multiplicador</div>
              <div className="sim-stat-value">{m.multiple.toFixed(2)}×</div>
              <div className="sim-stat-sub">valor final ÷ aportado</div>
            </div>
          </div>

          <div className="sim-card">
            <div className="sim-title">Evolución del capital</div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={m.data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="gSimValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.market} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={SERIES.market} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSimContrib" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.contributed} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={SERIES.contributed} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${v}a`} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} width={70} domain={[0, 'auto']} />
                <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(l) => `Año ${l}`} />
                <Legend />
                {m.boundaries.map(b => (
                  <ReferenceLine key={b} x={b} stroke="var(--_accent-line)" strokeDasharray="3 3" />
                ))}
                <Area
                  type="monotone" dataKey="aportado" name="Aportado"
                  stroke={SERIES.contributed} strokeWidth={2} fill="url(#gSimContrib)" dot={false}
                />
                <Area
                  type="monotone" dataKey="valor" name="Valor proyectado"
                  stroke={SERIES.market} strokeWidth={2} fill="url(#gSimValue)" dot={false}
                />
                {inflation > 0 && (
                  <Area
                    type="monotone" dataKey="valorReal" name="Valor real (hoy)"
                    stroke={SERIES.real} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="sim-note" style={{ marginTop: '0.9rem', maxWidth: '70ch' }}>
            Proyección teórica con rendimiento constante — la realidad varía y la inflación
            erosiona el poder de compra.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ Simulador de retiro */}
      <div className="sim-card sim-collapsible" style={{ marginTop: '1.1rem' }}>
        <button
          type="button" className="sim-collapsible-head"
          aria-expanded={retireOpen} onClick={() => setRetireOpen(o => !o)}
        >
          <span className={`sim-chevron${retireOpen ? ' open' : ''}`} aria-hidden>›</span>
          <span className="sim-collapsible-titles">
            <span className="sim-collapsible-title">Modo retiro — ¿cuánto te dura?</span>
            <span className="sim-collapsible-sub">
              Partiendo de los {money(m.finalValue)} acumulados, simulá una renta mensual
              {inflationAdjusted ? ' ajustada por inflación.' : ' fija.'}
            </span>
          </span>
        </button>

        {retireOpen && (
          <div className="sim-collapsible-body">
            <div className="sim-layout">
              {/* ------------------------------------------------ Controles retiro */}
              <div className="sim-card" style={{ alignSelf: 'start' }}>
                <div className="sim-field">
                  <label>Capital de partida</label>
                  <div className="sim-readout">
                    <span className="sim-readout-value">{money(m.finalValue)}</span>
                    <span className="sim-readout-note">valor final del simulador · {m.horizon} años</span>
                  </div>
                </div>

                <div className="sim-field">
                  <label>Renta mensual</label>
                  <div className="sim-affix">
                    <span className="sim-affix-label">{currency}</span>
                    <input
                      type="number" min="0" step="100" inputMode="numeric" placeholder="0" value={monthlyIncome}
                      onChange={e => setMonthlyIncome(e.target.value)}
                    />
                  </div>
                </div>

                <div className="sim-field">
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Rendimiento anual en retiro</span>
                    <span style={{ color: 'var(--_accent)', fontVariantNumeric: 'tabular-nums' }}>{retireRate}%</span>
                  </label>
                  <input
                    className="sim-range" type="range" min="0" max="15" step="0.5"
                    value={retireRate} onChange={e => setRetireRate(Number(e.target.value))}
                  />
                </div>

                <label className="sim-check">
                  <input
                    type="checkbox" checked={inflationAdjusted}
                    onChange={e => setInflationAdjusted(e.target.checked)}
                  />
                  <span>
                    Ajustar renta por inflación ({inflation}%)
                    <span className="sim-check-note">
                      la renta sube cada año para mantener el poder de compra
                    </span>
                  </span>
                </label>
              </div>

              {/* ------------------------------------------------ Resultados retiro */}
              <div>
                <div className="sim-card-grid" style={{ marginBottom: '1.1rem' }}>
                  <div className="sim-card">
                    <div className="sim-stat-label">Duración</div>
                    {parsedIncome <= 0 ? (
                      <>
                        <div className="sim-stat-value">—</div>
                        <div className="sim-stat-sub">ingresá una renta mensual</div>
                      </>
                    ) : d.sustainable ? (
                      <>
                        <div className="sim-stat-value sim-pos">Sostenible</div>
                        <div className="sim-stat-sub">el interés cubre la renta</div>
                      </>
                    ) : d.depleted ? (
                      <>
                        <div className="sim-stat-value sim-accent">{fmtDuration(d.monthsLasted)}</div>
                        <div className="sim-stat-sub">hasta agotar el capital</div>
                      </>
                    ) : (
                      <>
                        <div className="sim-stat-value sim-pos">+{DRAWDOWN_MAX_YEARS} años</div>
                        <div className="sim-stat-sub">dura más que el horizonte simulado</div>
                      </>
                    )}
                  </div>
                  <div className="sim-card">
                    <div className="sim-stat-label">Total retirado</div>
                    <div className="sim-stat-value">{money(d.totalWithdrawn)}</div>
                    <div className="sim-stat-sub">
                      {parsedIncome <= 0
                        ? '—'
                        : inflationAdjusted && d.finalMonthlyIncome > d.monthlyIncome
                          ? `${money(parsedIncome)}/mes → ${money(d.finalMonthlyIncome)}/mes`
                          : `${money(parsedIncome)} por mes`}
                    </div>
                  </div>
                  <div className="sim-card">
                    <div className="sim-stat-label">Renta anual</div>
                    <div className="sim-stat-value">{money(parsedIncome * 12)}</div>
                    <div className="sim-stat-sub">
                      {m.finalValue > 0
                        ? `${((parsedIncome * 12) / m.finalValue * 100).toFixed(1)}% del capital`
                        : '—'}
                    </div>
                  </div>
                </div>

                <div className="sim-card">
                  <div className="sim-title">Evolución del capital en retiro</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={d.data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                      <defs>
                        <linearGradient id="gSimSaldo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SERIES.market} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={SERIES.market} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gSimRetirado" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SERIES.withdrawn} stopOpacity={0.28} />
                          <stop offset="95%" stopColor={SERIES.withdrawn} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
                      <XAxis dataKey="year" type="number" domain={[0, 'auto']} tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${v}a`} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={fmt} width={70} domain={[0, 'auto']} />
                      <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(l) => `Año ${l}`} />
                      <Legend />
                      <Area
                        type="monotone" dataKey="saldo" name="Saldo restante"
                        stroke={SERIES.market} strokeWidth={2} fill="url(#gSimSaldo)" dot={false}
                      />
                      <Area
                        type="monotone" dataKey="retirado" name="Total retirado"
                        stroke={SERIES.withdrawn} strokeWidth={2} fill="url(#gSimRetirado)" dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <p className="sim-note" style={{ marginTop: '0.9rem', maxWidth: '70ch' }}>
                  Cada mes el saldo gana interés y luego se retira la renta.{' '}
                  {inflationAdjusted
                    ? `La renta sube cada año con la inflación (${inflation}%) para mantener el poder de compra, por lo que el capital se agota antes.`
                    : 'La renta queda fija en términos nominales; con inflación su poder de compra baja con los años.'}{' '}
                  Proyección teórica con rendimiento constante, sin impuestos.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ---------------------------------------------------- Escenarios guardados (drawer)
  const savedPanel = (
    <>
      <div
        className={`sim-backdrop${panelOpen ? ' open' : ''}`}
        onClick={() => setPanelOpen(false)} aria-hidden
      />
      <aside className={`sim-drawer${panelOpen ? ' open' : ''}`} aria-hidden={!panelOpen}>
        <div className="sim-drawer-head">
          <div className="sim-title" style={{ margin: 0 }}>Escenarios guardados</div>
          <button
            type="button" className="sim-period-x" aria-label="Cerrar panel"
            onClick={() => setPanelOpen(false)}
          >×</button>
        </div>

        {framed && (
          <div className="sim-sync">
            {syncStatus === 'on' ? (
              <span className="sim-sync-on">✓ Escenarios sincronizados entre sitios</span>
            ) : syncStatus === 'unsupported' ? (
              <span className="sim-sync-note">
                Tu navegador no permite compartir escenarios entre sitios embebidos.
                Abrí el simulador en una pestaña aparte para verlos todos juntos.
              </span>
            ) : (
              <>
                <button
                  type="button" className="sim-btn sim-btn-secondary sim-btn-sm"
                  onClick={enableSync} disabled={syncStatus === 'syncing'}
                >
                  {syncStatus === 'syncing' ? 'Sincronizando…' : 'Sincronizar entre sitios'}
                </button>
                <span className="sim-sync-note">
                  Compartí estos escenarios con los otros sitios donde está embebido el simulador.
                </span>
              </>
            )}
          </div>
        )}

        <div className="sim-field" style={{ marginTop: '1rem' }}>
          <label>Nombre del escenario</label>
          <input
            value={scenarioName}
            onChange={e => setScenarioName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveCurrentScenario() }}
            placeholder="ej. Plan agresivo 15 años"
          />
        </div>
        <button
          type="button" className="sim-btn sim-btn-primary" style={{ width: '100%' }}
          disabled={!scenarioName.trim()} onClick={saveCurrentScenario}
        >
          Guardar escenario actual
        </button>

        <div className="sim-divider" />

        {saved.length === 0 ? (
          <p className="sim-empty">
            Todavía no guardaste escenarios. Dale un nombre al escenario actual y guardalo para volver a cargarlo después.
          </p>
        ) : (
          <div className="sim-saved-list">
            {saved.map(s => {
              const sc = s.scenario
              const totalYears = sc.periods.reduce((a, p) => a + Math.max(0, Math.floor(p.years)), 0)
              return (
                <div className="sim-saved-item" key={s.id}>
                  <div className="sim-saved-name">{s.name}</div>
                  <div className="sim-saved-summary">
                    {sc.currency} · {sc.rate}% · {totalYears} año{totalYears !== 1 ? 's' : ''} · {sc.periods.length} tramo{sc.periods.length !== 1 ? 's' : ''}
                    {sc.drawdown && sc.drawdown.monthlyIncome > 0 && (
                      <> · retiro {sc.currency} {fmt(sc.drawdown.monthlyIncome)}/mes</>
                    )}
                  </div>
                  <div className="sim-saved-foot">
                    <span className="sim-saved-date">{new Date(s.savedAt).toLocaleDateString(locale)}</span>
                    <div className="sim-actions">
                      <button className="sim-btn sim-btn-secondary sim-btn-sm" onClick={() => { loadSavedScenario(s); setPanelOpen(false) }}>Cargar</button>
                      <button className="sim-btn sim-btn-danger sim-btn-sm" onClick={() => deleteSavedScenario(s.id)}>Eliminar</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </aside>
    </>
  )

  return (
    <div className={standalone ? 'fin-sim fin-sim--standalone' : 'fin-sim'}>
      {body}
      {savedPanel}
    </div>
  )
}
