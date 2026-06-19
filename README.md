# Investment Simulator

Standalone deployment of the compound-interest **Simulador** — a "what-if"
projection tool with three layers:

- **Accumulation by tranches** — define a horizon as a sequence of periods, each
  with its own monthly contribution, over a constant nominal return.
- **Estimated inflation** — every figure is also shown in today's purchasing
  power (real terms) alongside the nominal numbers.
- **Modo retiro (drawdown)** — starting from the accumulated value, project how
  long a fixed monthly income lasts (optionally escalated yearly with inflation).

Scenarios are saved to `localStorage` and can be reloaded from a side drawer.
UI copy is in Spanish; numbers format with `es-UY`.

This project is a thin shell around `src/simulator/`, a self-contained component
copied from the parent *personal-investment-tracker* app. The folder has zero
app dependencies (React + Recharts only) — see [`src/simulator/README.md`](src/simulator/README.md).

## Stack

React + TypeScript (Vite), Recharts, Vitest. No backend — fully client-side.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

## Test & build

```bash
npm test           # vitest — projection unit tests
npm run build      # tsc -b + vite build → dist/
npm run preview    # serve the production build locally
```

## Deploy to Vercel

The repo is preconfigured ([`vercel.json`](vercel.json)) for Vite:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- SPA rewrite to `index.html`

Import the repository in Vercel (or run `vercel`); the framework is auto-detected
and the defaults above apply with no extra setup.

## Keeping it in sync

`src/simulator/` is a verbatim copy of
`frontend/src/components/simulator/` in the parent repo. To pull in upstream
changes, re-copy that folder.
