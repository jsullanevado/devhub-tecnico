import { isAuthError, StorageApiError } from '@supabase/supabase-js';
import type { AuthError } from '@supabase/supabase-js';
import { AppError, AppErrorCode } from './app-error';

export const DEFAULT_ERROR_MESSAGES: Record<AppErrorCode, string> = {
  config: 'La aplicación no está configurada correctamente.',
  network: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  unauthenticated: 'Tu sesión ha expirado. Inicia sesión de nuevo.',
  forbidden: 'No tienes permisos para realizar esta operación.',
  not_found: 'El recurso no existe o no tienes acceso.',
  conflict: 'El registro ya existe.',
  validation: 'Los datos enviados no son válidos.',
  rate_limited: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  storage: 'No se pudo procesar el archivo.',
  unknown: 'Ocurrió un error inesperado.',
};

type ErrorRule = readonly [AppErrorCode, string?];

// Códigos de Supabase Auth: https://supabase.com/docs/guides/auth/debugging/error-codes
const AUTH_RULES: Record<string, ErrorRule> = {
  invalid_credentials: ['unauthenticated', 'Correo o contraseña incorrectos.'],
  email_not_confirmed: ['unauthenticated', 'Debes confirmar tu correo antes de iniciar sesión.'],
  user_already_exists: ['conflict', 'Ya existe una cuenta con este correo.'],
  email_exists: ['conflict', 'Ya existe una cuenta con este correo.'],
  weak_password: ['validation', 'La contraseña no cumple los requisitos de seguridad.'],
  same_password: ['validation', 'La nueva contraseña debe ser distinta de la actual.'],
  email_address_invalid: ['validation', 'El correo electrónico no es válido.'],
  validation_failed: ['validation'],
  signup_disabled: ['forbidden', 'El registro de nuevos usuarios está deshabilitado.'],
  email_provider_disabled: ['forbidden', 'El acceso con correo está deshabilitado.'],
  over_email_send_rate_limit: [
    'rate_limited',
    'Se enviaron demasiados correos. Espera unos minutos.',
  ],
  over_request_rate_limit: ['rate_limited'],
  otp_expired: ['validation', 'El enlace ha expirado o ya fue utilizado. Solicita uno nuevo.'],
  flow_state_not_found: [
    'validation',
    'El enlace no es válido en este navegador. Ábrelo en el mismo navegador donde lo solicitaste.',
  ],
  flow_state_expired: ['validation', 'El enlace ha expirado. Solicita uno nuevo.'],
  bad_code_verifier: [
    'validation',
    'El enlace no es válido en este navegador. Ábrelo en el mismo navegador donde lo solicitaste.',
  ],
  session_not_found: ['unauthenticated'],
  session_expired: ['unauthenticated'],
  refresh_token_not_found: ['unauthenticated'],
  refresh_token_already_used: ['unauthenticated'],
  bad_jwt: ['unauthenticated'],
  no_authorization: ['unauthenticated'],
  user_not_found: ['not_found', 'El usuario no existe.'],
  user_banned: ['forbidden', 'La cuenta está bloqueada.'],
};

// SQLSTATE de PostgreSQL y códigos PGRST de PostgREST.
const POSTGREST_RULES: Record<string, ErrorRule> = {
  '42501': ['forbidden'],
  '23505': ['conflict'],
  '23503': ['validation', 'El recurso relacionado no existe o no tienes acceso.'],
  '23514': ['validation'],
  '23502': ['validation', 'Faltan campos obligatorios.'],
  '22001': ['validation', 'Uno de los campos supera la longitud permitida.'],
  '22P02': ['validation', 'Formato de dato no válido.'],
  '28000': ['unauthenticated'],
  '57014': ['unknown', 'La operación tardó demasiado. Inténtalo de nuevo.'],
  PGRST116: ['not_found'],
  PGRST301: ['unauthenticated'],
  PGRST302: ['unauthenticated'],
  PGRST303: ['unauthenticated'],
};

// statusCode de Supabase Storage.
const STORAGE_RULES: Record<string, ErrorRule> = {
  '400': ['validation', 'La solicitud del archivo no es válida.'],
  '401': ['unauthenticated'],
  '403': ['forbidden', 'No tienes permisos sobre este archivo.'],
  '404': ['not_found', 'El archivo no existe.'],
  '409': ['conflict', 'Ya existe un archivo con ese nombre.'],
  '413': ['validation', 'El archivo supera el tamaño máximo permitido.'],
  '415': ['validation', 'Tipo de archivo no permitido.'],
  '429': ['rate_limited'],
};

interface PostgrestErrorLike {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

/** Convierte cualquier error (Supabase, red, desconocido) en un AppError con mensaje en español. */
export function toAppError(error: unknown, fallbackMessage?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (isNetworkError(error)) {
    return build('network', undefined, error);
  }
  if (isAuthError(error)) {
    return fromAuthError(error);
  }
  if (error instanceof StorageApiError) {
    const rule = STORAGE_RULES[error.statusCode] ??
      STORAGE_RULES[String(error.status)] ?? ['storage'];
    return build(rule[0], rule[1], error, error.message);
  }
  if (isPostgrestErrorLike(error)) {
    const rule = POSTGREST_RULES[error.code] ?? ['unknown', fallbackMessage];
    return build(
      rule[0],
      rule[1],
      error,
      [error.code, error.message, error.details].filter(Boolean).join(' | '),
    );
  }
  return build(
    'unknown',
    fallbackMessage,
    error,
    error instanceof Error ? error.message : undefined,
  );
}

function fromAuthError(error: AuthError): AppError {
  if (error.name === 'AuthRetryableFetchError') {
    return build('network', undefined, error);
  }
  const rule =
    (error.code ? AUTH_RULES[error.code] : undefined) ??
    (error.status === 429 ? ['rate_limited'] : undefined);
  return rule
    ? build(rule[0], rule[1], error, error.message)
    : build('unknown', undefined, error, `${error.code ?? 'auth'}: ${error.message}`);
}

function build(
  code: AppErrorCode,
  message: string | undefined,
  cause: unknown,
  technicalDetail?: string,
): AppError {
  return new AppError(code, message ?? DEFAULT_ERROR_MESSAGES[code], { cause, technicalDetail });
}

function isPostgrestErrorLike(error: unknown): error is PostgrestErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate['code'] === 'string' &&
    typeof candidate['message'] === 'string' &&
    'details' in candidate
  );
}

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  const message =
    error instanceof Error ? error.message : isPostgrestErrorLike(error) ? error.message : '';
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}
