import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

// Served from https://ben1022.github.io/lifetracker-site/app/ (GitHub Pages).
export default defineConfig({
  base: '/lifetracker-site/app/',
  plugins: [preact()],
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 5173, strictPort: true },
  test: { include: ['test/**/*.test.ts'] },
})
