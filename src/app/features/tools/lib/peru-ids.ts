import { randomDigits, secureRandomInt } from './random';

/**
 * Identificadores peruanos SINTÉTICOS para pruebas.
 * - DNI: 8 dígitos aleatorios (no lleva dígito verificador en el número).
 * - RUC: 11 dígitos = prefijo (10 persona natural, 20 persona jurídica) +
 *   8 dígitos + dígito verificador módulo 11 (pesos 5,4,3,2,7,6,5,4,3,2).
 * Un número aleatorio puede coincidir con uno real: usar solo en entornos de prueba.
 */

export type PeruIdType = 'dni' | 'ruc-natural' | 'ruc-juridica';

export const PERU_ID_TYPES = [
  { value: 'dni', label: 'DNI (8 dígitos)' },
  { value: 'ruc-natural', label: 'RUC persona natural (10…)' },
  { value: 'ruc-juridica', label: 'RUC persona jurídica (20…)' },
] as const satisfies readonly { value: PeruIdType; label: string }[];

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
const RUC_PREFIXES = ['10', '15', '16', '17', '20'] as const;

/** Dígito verificador de un RUC a partir de sus 10 primeros dígitos. */
export function rucCheckDigit(firstTenDigits: string): number {
  if (!/^\d{10}$/.test(firstTenDigits)) {
    throw new Error('Se requieren exactamente 10 dígitos');
  }
  const sum = RUC_WEIGHTS.reduce(
    (acc, weight, index) => acc + weight * Number(firstTenDigits[index]),
    0,
  );
  const result = 11 - (sum % 11);
  return result === 10 ? 0 : result === 11 ? 1 : result;
}

export function generateDni(): string {
  // Evita DNIs que empiezan por 0 para que no se pierdan ceros al pegarlos en hojas de cálculo.
  return `${secureRandomInt(9) + 1}${randomDigits(7)}`;
}

export function generateRuc(kind: 'natural' | 'juridica'): string {
  const body = kind === 'natural' ? `10${generateDni()}` : `20${randomDigits(8)}`;
  return `${body}${rucCheckDigit(body)}`;
}

export function generatePeruId(type: PeruIdType): string {
  switch (type) {
    case 'dni':
      return generateDni();
    case 'ruc-natural':
      return generateRuc('natural');
    case 'ruc-juridica':
      return generateRuc('juridica');
  }
}

export interface IdValidation {
  valid: boolean;
  message: string;
}

export function validateRuc(input: string): IdValidation {
  const value = input.replace(/\s/g, '');
  if (!/^\d{11}$/.test(value)) {
    return { valid: false, message: 'El RUC debe tener exactamente 11 dígitos.' };
  }
  if (!(RUC_PREFIXES as readonly string[]).includes(value.slice(0, 2))) {
    return { valid: false, message: 'Prefijo no válido (se esperaba 10, 15, 16, 17 o 20).' };
  }
  const expected = rucCheckDigit(value.slice(0, 10));
  return Number(value[10]) === expected
    ? { valid: true, message: 'Formato y dígito verificador correctos.' }
    : { valid: false, message: `Dígito verificador incorrecto (se esperaba ${expected}).` };
}

export function validateDniFormat(input: string): IdValidation {
  const value = input.replace(/\s/g, '');
  return /^\d{8}$/.test(value)
    ? { valid: true, message: 'Formato correcto (8 dígitos).' }
    : { valid: false, message: 'El DNI debe tener exactamente 8 dígitos.' };
}
