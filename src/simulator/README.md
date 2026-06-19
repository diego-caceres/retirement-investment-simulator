# Simulator — portable compound-interest projection

A self-contained React component for "what-if" compound-interest projections by
contribution tranches, with named-scenario save/load. An **estimated annual inflation**
input reports every figure in today's purchasing power (real terms) alongside the
nominal numbers. A collapsible **retirement ("modo retiro") section** takes the
accumulated value and projects how long a monthly income lasts while the un-withdrawn
balance keeps earning interest — with an option to escalate that income yearly with
inflation. Saved scenarios live in a right-hand drawer (collapsed by default).
**Drop-in:** copy this whole folder into any React + TypeScript project.

## Dependencies

- `react` (peer)
- `recharts` (peer) — the only non-React runtime dependency.

```bash
npm install recharts
```

## Usage

```tsx
import { Simulator } from './components/simulator'

<Simulator />
```

All props are optional:

| Prop              | Default                          | Purpose                                            |
|-------------------|----------------------------------|----------------------------------------------------|
| `standalone`      | `false`                          | Centered, menu-less full-page shell.               |
| `currencies`      | `['USD','UYU','UYI']`            | Selectable currency codes (display only).          |
| `defaultScenario` | 0 capital · 7% · 5/10/15y tramos | Shown on first load when nothing is persisted.     |
| `locale`          | `'es-UY'`                        | Number/date formatting locale.                     |
| `storageKeys`     | `{ last, saved }`                | localStorage keys; pass `null` to disable saving.  |
| `fullScreenHref`  | `'/sim'`                         | Link target for "open full screen"; `null` hides.  |

```tsx
<Simulator
  currencies={['USD', 'EUR']}
  locale="en-US"
  storageKeys={null}        // ephemeral, no persistence
  fullScreenHref={null}     // hide the full-screen link
/>
```

## Styling

Styles live in `Simulator.css` (imported by the component) and are fully scoped
under `.fin-sim` — they neither depend on nor leak into the host app's CSS.

Colors read from a set of optional CSS custom properties **with built-in
fallbacks**, so the component looks right standalone and adopts a host design
system automatically when these tokens are defined on `:root`:

`--bg-deep`, `--surface`, `--surface-2`, `--border`, `--border-strong`,
`--text`, `--text-muted`, `--text-faint`, `--accent`, `--accent-strong`,
`--accent-soft`, `--accent-line`, `--on-accent`, `--pos`, `--neg`, `--neg-soft`,
`--radius`, `--radius-sm`, `--radius-xs`, `--font-body`, `--nums`, `--shadow-card`.

## Pure logic

`projection.ts` has zero dependencies (no React, no DOM) and can be imported on
its own — e.g. for tests or server-side computation:

```ts
import { project } from './components/simulator/projection'

const result = project(0, 7, [{ id: 1, years: 10, monthly: 500 }])
result.finalValue // → nominal projected balance

// A 4th arg deflates to today's purchasing power (nominal figures stay intact):
project(0, 7, [{ id: 1, years: 10, monthly: 500 }], 4).realFinalValue
```

`projectDrawdown(startValue, ratePct, monthlyIncome, inflationPct?)` is the retirement
counterpart: each month the balance earns interest, then an income is withdrawn. It
returns how long the income lasts (`monthsLasted`/`depleted`) — or flags it `sustainable`
when the interest alone covers the withdrawal and the capital never runs out. Pass a
positive `inflationPct` to escalate the income yearly (it then depletes faster, and
`finalMonthlyIncome` reports the last, grown payment).

```ts
import { projectDrawdown } from './components/simulator/projection'

projectDrawdown(500000, 6, 4000).monthsLasted     // months until the capital is exhausted
projectDrawdown(500000, 6, 4000, 4).monthsLasted  // fewer — the income rises with inflation
```
