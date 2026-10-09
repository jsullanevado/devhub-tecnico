import { defineConfig } from '@playwright/test';

/**
 * Pruebas E2E en un navegador real contra la app compilada con environment.e2e.ts.
 * Supabase se simula interceptando la red (e2e/support/supabase-mock.ts): validan
 * la interfaz y la integración del frontend, NO las políticas RLS reales
 * (esas se prueban con supabase/tests/etapa1_pruebas_rls.sql).
 *
 * Usa el Chrome instalado en el equipo (sin descargar navegadores).
 * Otro navegador: PW_CHANNEL=msedge npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4300',
    channel: process.env['PW_CHANNEL'] ?? 'chrome',
    locale: 'es-PE',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'movil', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run start:e2e',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
