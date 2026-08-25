import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  // Playwright possède ses propres specs sous e2e/ : sans cette exclusion,
  // `vitest run` tente aussi de les exécuter (et échoue, faute d'environnement
  // navigateur Playwright dans jsdom).
  test: { environment: 'jsdom', globals: true, exclude: [...configDefaults.exclude, 'e2e/**'] },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
})
