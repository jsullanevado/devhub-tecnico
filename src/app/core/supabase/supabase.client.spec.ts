import { AppError } from '../errors/app-error';
import { assertSupabaseConfig, isPrivilegedKey } from './supabase.client';

const base64Url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fakeJwt = (role: string) => `${base64Url({ alg: 'HS256' })}.${base64Url({ role })}.firma`;

describe('isPrivilegedKey', () => {
  it('detecta claves secret y service_role', () => {
    expect(isPrivilegedKey('sb_secret_abc')).toBe(true);
    expect(isPrivilegedKey(fakeJwt('service_role'))).toBe(true);
  });

  it('acepta claves publishable y anon', () => {
    expect(isPrivilegedKey('sb_publishable_abc')).toBe(false);
    expect(isPrivilegedKey(fakeJwt('anon'))).toBe(false);
  });
});

describe('assertSupabaseConfig', () => {
  it('exige url y clave', () => {
    expect(() => assertSupabaseConfig({ url: '', publishableKey: '' })).toThrow(AppError);
  });

  it('rechaza URLs que no son https (salvo localhost)', () => {
    expect(() =>
      assertSupabaseConfig({ url: 'http://ejemplo.com', publishableKey: 'sb_publishable_x' }),
    ).toThrow(AppError);
    expect(() =>
      assertSupabaseConfig({ url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_x' }),
    ).not.toThrow();
  });

  it('rechaza claves privilegiadas', () => {
    expect(() =>
      assertSupabaseConfig({ url: 'https://abc.supabase.co', publishableKey: 'sb_secret_x' }),
    ).toThrow(/privilegiada/);
  });

  it('acepta una configuración válida', () => {
    expect(() =>
      assertSupabaseConfig({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x' }),
    ).not.toThrow();
  });
});
