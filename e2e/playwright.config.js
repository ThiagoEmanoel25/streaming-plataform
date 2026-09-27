import { defineConfig } from '@playwright/test';

// Usa o Google Chrome já instalado (channel: 'chrome') em vez de baixar um navegador.
export default defineConfig({
  testDir: './tests',
  outputDir: './out/artifacts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: './out/report', open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
