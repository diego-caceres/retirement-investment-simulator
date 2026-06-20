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

## Deploy to Vercel (served under `/simulador`)

This app is meant to live at `https://diegocaceres.dev/simulador` as a **separate
Vercel deployment**, proxied from the main site (Vercel multi-zone). To make every
asset resolve through that proxy it is built with a base path:

- `vite.config.ts` → `base: '/simulador/'`
- [`vercel.json`](vercel.json) maps the prefix:
  - `/simulador/assets/*` → the physical `/assets/*` files
  - `/simulador` and `/simulador/*` → `index.html` (SPA fallback)
  - `/` → redirect to `/simulador`

Deploy steps:

1. Import this repo in Vercel (framework auto-detected as Vite) and deploy. Note its
   production domain, e.g. `investment-simulator.vercel.app`.
2. In the **main site** (`diego-caceres-site`) `vercel.json`, add a rewrite so the
   apex domain proxies the prefix to this deployment:

   ```json
   {
     "rewrites": [
       { "source": "/simulador",        "destination": "https://investment-simulator.vercel.app/simulador" },
       { "source": "/simulador/:path*", "destination": "https://investment-simulator.vercel.app/simulador/:path*" }
     ]
   }
   ```

3. Redeploy the main site. `https://diegocaceres.dev/simulador` now serves this app.

> Always point the rewrite at the project's **production** domain (the stable
> `*.vercel.app`), never a per-deploy immutable URL — otherwise it pins to one build.
> To change the path prefix, update `base` in `vite.config.ts`, the `vercel.json`
> rewrites here, and the main-site rewrite together.

## Keeping it in sync

`src/simulator/` is a verbatim copy of
`frontend/src/components/simulator/` in the parent repo. To pull in upstream
changes, re-copy that folder.
