import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    // 127.0.0.1 et non localhost : sous Windows, `localhost` résout d'abord en
    // IPv6 (`::1`), où le relais de ports WSL de Docker Desktop peut détenir le
    // port et réinitialiser la connexion, alors que Docker publie sur
    // 0.0.0.0:3000 en IPv4. Forcer IPv4 évite un ERR_CONNECTION_RESET qui n'a
    // rien à voir avec l'application. Sous Linux et en CI, les deux marchent.
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
