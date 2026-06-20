import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served under the `/simulador` path of diegocaceres.dev (Vercel multi-zone),
// so every asset URL must carry that prefix. The matching rewrites live in
// vercel.json (here) and in the parent site's vercel.json.
const BASE = '/simulador/'

// No backend proxy — the simulator is fully client-side.
export default defineConfig({
  base: BASE,
  plugins: [react()],
})
