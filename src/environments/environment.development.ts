import { AppEnvironment } from './app-environment';

// Desarrollo (`ng serve`). Completar con los valores de Project Settings → API Keys.
export const environment: AppEnvironment = {
  production: false,
  appName: 'DevHub Técnico',
  supabase: {
    url: 'https://hjmwtkjxfjvltcimygzb.supabase.co',
    publishableKey: 'sb_publishable_jG7_bWJ9Z_g-exUsvUYdUA_xx6Or-hY',
  },
  storage: {
    documentsBucket: 'devhub-documents',
    signedUrlTtlSeconds: 60,
  },
};
