/**
 * Entero aleatorio uniforme en [0, max) con el generador criptográfico del
 * navegador (sin el sesgo de `Math.random() * n` ni del módulo simple).
 */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) {
    throw new RangeError('max debe ser un entero entre 1 y 2^32');
  }
  const limit = Math.floor(2 ** 32 / max) * max;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

export function randomDigits(length: number): string {
  return Array.from({ length }, () => secureRandomInt(10)).join('');
}

/** Acota la cantidad pedida por el usuario a un rango seguro. */
export function clampCount(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), min), max) : min;
}
