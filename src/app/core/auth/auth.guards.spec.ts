import { sanitizeRedirect } from './auth.guards';

describe('sanitizeRedirect', () => {
  it('acepta rutas internas', () => {
    expect(sanitizeRedirect('/scripts')).toBe('/scripts');
    expect(sanitizeRedirect('/notes/123?tab=1')).toBe('/notes/123?tab=1');
  });

  it('rechaza redirecciones externas o ambiguas', () => {
    expect(sanitizeRedirect('https://malicioso.com')).toBe('/dashboard');
    expect(sanitizeRedirect('//malicioso.com')).toBe('/dashboard');
    expect(sanitizeRedirect('/\\malicioso.com')).toBe('/dashboard');
    expect(sanitizeRedirect('javascript:alert(1)')).toBe('/dashboard');
  });

  it('evita volver a las pantallas de autenticación', () => {
    expect(sanitizeRedirect('/auth/login')).toBe('/dashboard');
  });

  it('usa el valor por defecto si no hay destino', () => {
    expect(sanitizeRedirect(null)).toBe('/dashboard');
    expect(sanitizeRedirect(undefined, '/notes')).toBe('/notes');
  });
});
