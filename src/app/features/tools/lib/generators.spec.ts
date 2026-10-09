import {
  generateDni,
  generatePeruId,
  generateRuc,
  rucCheckDigit,
  validateDniFormat,
  validateRuc,
} from './peru-ids';
import { clampCount, secureRandomInt } from './random';
import { formatCardNumber, generateTestCardData, luhnCheck, TEST_CARDS } from './test-cards';
import { generateUuids, inspectUuid } from './uuid';

describe('RUC', () => {
  it('calcula el dígito verificador de un RUC público conocido (SUNAT 20131312955)', () => {
    expect(rucCheckDigit('2013131295')).toBe(5);
    expect(validateRuc('20131312955').valid).toBe(true);
  });

  it('detecta dígito verificador, longitud y prefijo incorrectos', () => {
    expect(validateRuc('20131312954').valid).toBe(false);
    expect(validateRuc('2013131295').valid).toBe(false);
    expect(validateRuc('99131312955').valid).toBe(false);
  });

  it('genera RUC válidos con el prefijo pedido', () => {
    for (let i = 0; i < 200; i++) {
      const natural = generateRuc('natural');
      const juridica = generateRuc('juridica');
      expect(natural.startsWith('10')).toBe(true);
      expect(juridica.startsWith('20')).toBe(true);
      expect(validateRuc(natural).valid).toBe(true);
      expect(validateRuc(juridica).valid).toBe(true);
    }
  });
});

describe('DNI', () => {
  it('genera 8 dígitos sin cero inicial', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateDni()).toMatch(/^[1-9]\d{7}$/);
    }
  });

  it('valida el formato', () => {
    expect(validateDniFormat('12345678').valid).toBe(true);
    expect(validateDniFormat('1234567').valid).toBe(false);
    expect(validateDniFormat('1234567a').valid).toBe(false);
  });

  it('generatePeruId respeta el tipo', () => {
    expect(generatePeruId('dni')).toHaveLength(8);
    expect(generatePeruId('ruc-juridica')).toHaveLength(11);
  });
});

describe('random', () => {
  it('secureRandomInt está dentro del rango', () => {
    for (let i = 0; i < 500; i++) {
      const value = secureRandomInt(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it('clampCount acota y trunca', () => {
    expect(clampCount(500, 1, 50)).toBe(50);
    expect(clampCount(-3, 1, 50)).toBe(1);
    expect(clampCount(Number.NaN, 1, 50)).toBe(1);
    expect(clampCount(7.9, 1, 50)).toBe(7);
  });
});

describe('UUID', () => {
  it('genera UUID v4 válidos y únicos', () => {
    const uuids = generateUuids(50, { uppercase: false, hyphens: true });
    expect(new Set(uuids).size).toBe(50);
    for (const uuid of uuids) {
      expect(inspectUuid(uuid)).toEqual({ valid: true, version: 4, standardVariant: true });
    }
  });

  it('aplica mayúsculas y sin guiones', () => {
    const [uuid] = generateUuids(1, { uppercase: true, hyphens: false });
    expect(uuid).toMatch(/^[0-9A-F]{32}$/);
  });

  it('rechaza texto que no es un UUID', () => {
    expect(inspectUuid('no-es-un-uuid').valid).toBe(false);
  });
});

describe('tarjetas de prueba', () => {
  it('todas las tarjetas publicadas superan Luhn', () => {
    for (const card of TEST_CARDS) {
      expect(luhnCheck(card.number)).toBe(true);
    }
  });

  it('Luhn rechaza números alterados', () => {
    expect(luhnCheck('4242424242424241')).toBe(false);
    expect(luhnCheck('abcd')).toBe(false);
  });

  it('genera vencimiento futuro y CVC de la longitud correcta', () => {
    const now = new Date(2026, 9, 9);
    const amex = TEST_CARDS.find((card) => card.brand === 'American Express')!;
    const data = generateTestCardData(amex, now);
    expect(data.cvc).toMatch(/^\d{4}$/);
    const [month, year] = data.expiry.split('/').map(Number);
    expect(new Date(2000 + year, month - 1, 1) > new Date(2026, 9, 1)).toBe(true);
  });

  it('formatea números de 16 y 15 dígitos', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
  });
});
