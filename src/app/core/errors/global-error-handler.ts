import { ErrorHandler, Injectable, inject } from '@angular/core';
import { NotificationService } from '../notifications/notification.service';
import { DEFAULT_ERROR_MESSAGES, toAppError } from './error-mapper';

/**
 * Último recurso para errores no capturados (incluidas promesas rechazadas).
 * Los servicios lanzan AppError y los componentes los gestionan localmente;
 * aquí solo llega lo que se escapó.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly notifications = inject(NotificationService);

  handleError(error: unknown): void {
    const appError = toAppError(error);
    console.error(
      '[DevHub]',
      appError.code,
      appError.technicalDetail ?? appError.message,
      appError.cause ?? error,
    );
    this.notifications.error(
      appError.code === 'unknown' ? DEFAULT_ERROR_MESSAGES.unknown : appError.message,
    );
  }
}
