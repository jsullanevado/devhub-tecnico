import { AppEnvironment } from './app-environment';

// Solo para pruebas E2E: Supabase ficticio, interceptado por Playwright (e2e/support/supabase-mock.ts).
export const environment: AppEnvironment = {
  production: false,
  appName: 'DevHub Técnico',
  supabase: {
    url: 'https://e2e-mock.supabase.co',
    publishableKey: 'sb_publishable_e2e_mock',
  },
  storage: {
    documentsBucket: 'devhub-documents',
    signedUrlTtlSeconds: 60,
  },
};
