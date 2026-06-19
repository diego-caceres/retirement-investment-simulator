# CLAUDE.md

Guía para trabajar en este repositorio. Para una visión general del producto, ver [README.md](README.md).

## Qué es

App de una sola pantalla: un **Simulador** de interés compuesto ("what-if") 100% client-side. No hay backend. Toda la app es el componente `<Simulator>` renderizado en modo `standalone` ([src/App.tsx](src/App.tsx)).

Tres capas de cálculo:
- **Acumulación por tramos** — el horizonte es una secuencia de `Period`s, cada uno con su aporte mensual, sobre una tasa nominal constante.
- **Inflación estimada** — cada cifra se muestra también en poder adquisitivo de hoy (términos reales).
- **Modo retiro (drawdown)** — desde el valor acumulado, proyecta cuánto dura un ingreso mensual fijo (opcionalmente escalado con inflación).

Los escenarios se guardan en `localStorage`. La UI está en español; los números se formatean con `es-UY`.

## Comandos

```bash
npm run dev        # Vite dev server → http://localhost:5173
npm test           # Vitest (test único: projection.test.ts) — corre una vez, sin watch
npm run build      # tsc -b + vite build → dist/
npm run preview    # sirve el build de producción
```

No hay linter ni formatter configurado. No hay watch mode en `test` (usa `vitest run`).

## Arquitectura

Todo el peso vive en `src/simulator/`, una carpeta **autocontenida** (solo depende de React + Recharts):

- [projection.ts](src/simulator/projection.ts) — **lógica pura, cero dependencias** (sin React, sin DOM). `project()`, `projectDrawdown()`, validación (`isValidScenario`) y tipos. Toda la matemática vive acá.
- [projection.test.ts](src/simulator/projection.test.ts) — tests unitarios de la lógica pura. Es el único archivo de tests.
- [Simulator.tsx](src/simulator/Simulator.tsx) — el componente de UI (~640 líneas), con sus props. Inputs editables se guardan como strings (para poder vaciarlos al tipear) y se parsean a número con el helper `num()`.
- [storage.ts](src/simulator/storage.ts) — helpers de `localStorage`, parametrizados por key; todos best-effort (tragan errores de quota/disponibilidad).
- [Simulator.css](src/simulator/Simulator.css) — estilos scopeados bajo `.fin-sim`; leen CSS custom properties con fallbacks incorporados.
- [index.ts](src/simulator/index.ts) — barrel de exports público de la carpeta.

## Convenciones del código

- **TypeScript estricto**, sin punto y coma (estilo del repo). Imports de tipos con `import type`.
- **Comentarios explican el "por qué"**, no el "qué" — seguí ese tono al editar (ver los headers de cada archivo).
- **Nombres de dominio en español** en datos visibles al usuario (`aportado`, `valor`, `valorReal`, `saldo`, `retirado`); API/tipos en inglés.
- `projection.ts` debe quedarse **libre de React y DOM** — es importable en Node/tests. No metas nada de UI ahí.
- Convención de cálculo: capitalización mensual, aportes al **fin de cada mes**, tasa nominal constante. La inflación deflacta a poder adquisitivo del año 0; las cifras nominales nunca se tocan.
- Datos que vienen de `localStorage` (o externos) siempre pasan por `isValidScenario` antes de usarse. Los campos `inflation` y `drawdown` son opcionales (escenarios viejos no los tienen).

## ⚠️ Esta carpeta es una copia, no la fuente

`src/simulator/` es una **copia verbatim** de `frontend/src/components/simulator/` del repo padre *personal-investment-tracker*. Es drop-in y no debe ganar dependencias de esta app.

- Cambios de fondo en la lógica del simulador idealmente van **upstream** en el repo padre y se re-copian acá.
- Si editás acá directamente, mantené la portabilidad: nada de imports fuera de `src/simulator/`, nada de dependencias más allá de React + Recharts.

## Deploy

Vercel, preconfigurado en [vercel.json](vercel.json): framework `vite`, build `npm run build`, output `dist/`, rewrite SPA a `index.html`. No requiere setup extra.
