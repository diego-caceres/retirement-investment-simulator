import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone build — no backend proxy (the simulator is fully client-side).
export default defineConfig({
  plugins: [react()],
})
