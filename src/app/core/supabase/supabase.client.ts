import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppEnvironment } from '../../../environments/app-environment';
import { environment } from '../../../environments/environment';
import { AppError } from '../errors/app-error';
import { Database } from './database.types';

export type DevHubSupabaseClient = SupabaseClient<Database>;

/** Cliente único de Supabase. Inyectar con `inject(SUPABASE)`; sustituible en pruebas. */
export const SUPABASE = new InjectionToken<DevHubSupabaseClient>('SUPABASE', {
  providedIn: 'root',
  factory: () => createSupabaseClient(environment),
});

export function createSupabaseClient(env: AppEnvironment): DevHubSupabaseClient {
  assertSupabaseConfig(env.supabase);
  return createClient<Database>(env.supabase.url, env.supabase.publishableKey, {
    auth: {
      // PKCE: los enlaces de correo devuelven un código de un solo uso en lugar de tokens en la URL.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function assertSupabaseConfig(config: AppEnvironment['supabase']): void {
  const url = config.url.trim();
  const key = config.publishableKey.trim();

  if (!url || !key) {
    throw new AppError(
      'config',
      'Falta configurar supabase.url y supabase.publishableKey en src/environments.',
    );
  }
  if (
    !/^https:\/\/[^/]+$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.replace(/\/$/, ''))
  ) {
    throw new AppError(
      'config',
      'supabase.url debe ser la URL https del proyecto (o localhost en desarrollo).',
    );
  }
  if (isPrivilegedKey(key)) {
    throw new AppError(
      'config',
      'La clave configurada es privilegiada (secret/service_role). En el frontend solo se permite la clave publishable o anon.',
    );
  }
}

/** Detecta claves que nunca deben llegar al navegador. */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) {
    return true;
  }
  const parts = key.split('.');
  if (parts.length !== 3) {
    return false;
  }
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: unknown;
    };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}
