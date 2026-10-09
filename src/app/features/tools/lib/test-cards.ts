import { secureRandomInt } from './random';

/**
 * Tarjetas de PRUEBA publicadas en la documentación de pasarelas de pago
 * (p. ej. Stripe). Solo funcionan en sus entornos sandbox; no son tarjetas reales.
 * Deliberadamente NO se generan números a partir de BIN reales.
 */
export const TEST_CARDS = [
  { brand: 'Visa', number: '4242424242424242', cvcLength: 3 },
  { brand: 'Visa (débito)', number: '4000056655665556', cvcLength: 3 },
  { brand: 'Mastercard', number: '5555555555554444', cvcLength: 3 },
  { brand: 'Mastercard (serie 2)', number: '2223003122003222', cvcLength: 3 },
  { brand: 'American Express', number: '378282246310005', cvcLength: 4 },
  { brand: 'Discover', number: '6011111111111117', cvcLength: 3 },
  { brand: 'Diners Club', number: '3056930009020004', cvcLength: 3 },
  { brand: 'JCB', number: '3566002020360505', cvcLength: 3 },
  { brand: 'UnionPay', number: '6200000000000005', cvcLength: 3 },
] as const;

export type TestCard = (typeof TEST_CARDS)[number];

export interface TestCardData {
  brand: string;
  number: string;
  expiry: string;
  cvc: string;
  holder: string;
}

/** Algoritmo de Luhn (módulo 10). */
export function luhnCheck(input: string): boolean {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) {
    return false;
  }
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Agrupa en bloques de 4 (Amex: 4-6-5). */
export function formatCardNumber(number: string): string {
  if (number.length === 15) {
    return `${number.slice(0, 4)} ${number.slice(4, 10)} ${number.slice(10)}`;
  }
  return number.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Datos completos ficticios: número de prueba + vencimiento futuro + CVC aleatorio. */
export function generateTestCardData(card: TestCard, now = new Date()): TestCardData {
  const monthsAhead = 1 + secureRandomInt(48);
  const expiry = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1);
  const month = String(expiry.getMonth() + 1).padStart(2, '0');
  const year = String(expiry.getFullYear() % 100).padStart(2, '0');
  const cvc = Array.from({ length: card.cvcLength }, () => secureRandomInt(10)).join('');
  return {
    brand: card.brand,
    number: card.number,
    expiry: `${month}/${year}`,
    cvc,
    holder: 'USUARIO PRUEBA DEVHUB',
  };
}
