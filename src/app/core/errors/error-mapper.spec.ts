import { AuthApiError, PostgrestError, StorageApiError } from '@supabase/supabase-js';
import { AppError } from './app-error';
import { toAppError } from './error-mapper';

const pgError = (code: string, message = 'error') =>
  new PostgrestError({ code, message, details: '', hint: '' });

describe('toAppError', () => {
  it('devuelve el mismo AppError', () => {
    const original = new AppError('validation', 'x');
    expect(toAppError(original)).toBe(original);
  });

  it('traduce errores de RLS/privilegios a forbidden', () => {
    expect(toAppError(pgError('42501')).code).toBe('forbidden');
  });

  it('traduce violaciones de unicidad y CHECK', () => {
    expect(toAppError(pgError('23505')).code).toBe('conflict');
    expect(toAppError(pgError('23514')).code).toBe('validation');
  });

  it('traduce credenciales inválidas de Auth con mensaje en español', () => {
    const error = toAppError(
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    );
    expect(error.code).toBe('unauthenticated');
    expect(error.message).toBe('Correo o contraseña incorrectos.');
  });

  it('traduce límites de frecuencia de Auth por estado 429', () => {
    expect(toAppError(new AuthApiError('Too many', 429, undefined)).code).toBe('rate_limited');
  });

  it('traduce errores de Storage por statusCode', () => {
    expect(toAppError(new StorageApiError('too big', 400, '413')).code).toBe('validation');
    expect(toAppError(new StorageApiError('denied', 400, '403')).code).toBe('forbidden');
  });

  it('detecta fallos de red', () => {
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(toAppError(pgError('', 'TypeError: Failed to fetch')).code).toBe('network');
  });

  it('usa unknown con el mensaje alternativo para errores no reconocidos', () => {
    const error = toAppError(new Error('boom'), 'No se pudo guardar.');
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('No se pudo guardar.');
    expect(error.technicalDetail).toBe('boom');
  });
});
