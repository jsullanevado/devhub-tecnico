import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Error `mismatch` si el valor difiere del control hermano indicado (p. ej. confirmar contraseña). */
export function matchesControl(otherControlName: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const other = control.parent?.get(otherControlName);
    if (!other || !control.value) {
      return null;
    }
    return control.value === other.value ? null : { mismatch: true };
  };
}

/**
 * Error `required` si el control hermano tiene el valor indicado y este está vacío
 * (p. ej. solución obligatoria cuando el estado es "resuelta").
 */
export function requiredWhen(otherControlName: string, expected: unknown): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const other = control.parent?.get(otherControlName);
    if (!other || other.value !== expected) {
      return null;
    }
    const value: unknown = control.value;
    const empty = value === null || value === undefined || String(value).trim() === '';
    return empty ? { required: true } : null;
  };
}

/** Error `blank` si el texto solo contiene espacios. */
export const notBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.length > 0 && control.value.trim() === ''
    ? { blank: true }
    : null;
