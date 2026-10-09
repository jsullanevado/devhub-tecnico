import { Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, ValidationErrors } from '@angular/forms';
import { map, startWith, switchMap } from 'rxjs';

/**
 * Errores visibles de un control como signal (solo si está tocado). Los
 * formularios reactivos no son signals: se escucha `events` (valor, estado,
 * touched) para refrescar la vista con OnPush/zoneless. Requiere contexto de inyección.
 */
export function trackControlErrors(
  control: Signal<AbstractControl>,
): Signal<ValidationErrors | null> {
  return toSignal(
    toObservable(control).pipe(
      switchMap((current) =>
        current.events.pipe(
          startWith(null),
          map(() => (current.invalid && current.touched ? current.errors : null)),
        ),
      ),
    ),
    { initialValue: null },
  );
}

export type ErrorMessages = Partial<Record<string, string>>;

/** Primer error del control como mensaje en español. `custom` permite textos por campo. */
export function controlErrorMessage(
  errors: ValidationErrors | null,
  custom: ErrorMessages = {},
): string | null {
  if (!errors) {
    return null;
  }
  const [key] = Object.keys(errors);
  const customMessage = custom[key];
  if (customMessage) {
    return customMessage;
  }
  const detail = errors[key] as { requiredLength?: number } | boolean;
  switch (key) {
    case 'required':
    case 'blank':
      return 'Este campo es obligatorio.';
    case 'email':
      return 'Introduce un correo electrónico válido.';
    case 'minlength':
      return `Debe tener al menos ${typeof detail === 'object' ? detail.requiredLength : ''} caracteres.`;
    case 'maxlength':
      return `No puede superar ${typeof detail === 'object' ? detail.requiredLength : ''} caracteres.`;
    case 'pattern':
      return 'El formato no es válido.';
    case 'mismatch':
      return 'Los valores no coinciden.';
    default:
      return 'El valor no es válido.';
  }
}
