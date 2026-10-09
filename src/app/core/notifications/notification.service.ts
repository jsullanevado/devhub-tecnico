import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
}

const MAX_VISIBLE = 5;
const DEFAULT_DURATION_MS: Record<NotificationType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 7000,
};

/** Cola de notificaciones (toasts). El componente visual se implementa en la etapa 3. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  private readonly _items = signal<readonly AppNotification[]>([]);
  readonly items = this._items.asReadonly();

  success(message: string, durationMs?: number): number {
    return this.push('success', message, durationMs);
  }

  error(message: string, durationMs?: number): number {
    return this.push('error', message, durationMs);
  }

  warning(message: string, durationMs?: number): number {
    return this.push('warning', message, durationMs);
  }

  info(message: string, durationMs?: number): number {
    return this.push('info', message, durationMs);
  }

  dismiss(id: number): void {
    this._items.update((items) => items.filter((item) => item.id !== id));
  }

  private push(
    type: NotificationType,
    message: string,
    durationMs = DEFAULT_DURATION_MS[type],
  ): number {
    const id = this.nextId++;
    this._items.update((items) => [...items.slice(-(MAX_VISIBLE - 1)), { id, type, message }]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
    return id;
  }
}
