import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { toAppError } from '../../core/errors/error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { NotificationService } from '../../core/notifications/notification.service';

export interface DeletionRequest {
  /** Título del diálogo, p. ej. "Eliminar script". */
  dialogTitle: string;
  resourceTitle: string;
  successMessage: string;
  remove: () => Promise<void>;
  redirectTo: string;
}

/** Flujo común de borrado: confirmación → eliminación → aviso → redirección. */
@Injectable({ providedIn: 'root' })
export class ResourceDeletion {
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  async run(request: DeletionRequest): Promise<boolean> {
    const confirmed = await this.confirm.ask({
      title: request.dialogTitle,
      message: `Se eliminará «${request.resourceTitle}» de forma permanente. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!confirmed) {
      return false;
    }
    try {
      await request.remove();
      this.notifications.success(request.successMessage);
      await this.router.navigateByUrl(request.redirectTo);
      return true;
    } catch (error) {
      this.notifications.error(toAppError(error).message);
      return false;
    }
  }
}
