import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmService } from '../../core/notifications/confirm.service';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Pide confirmación antes de abandonar un formulario con cambios sin guardar. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) =>
  !component.hasUnsavedChanges() ||
  inject(ConfirmService).ask({
    title: 'Cambios sin guardar',
    message: 'Tienes cambios sin guardar. Si sales ahora, se perderán.',
    confirmLabel: 'Salir sin guardar',
    cancelLabel: 'Seguir editando',
    tone: 'danger',
  });
