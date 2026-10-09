import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  NotificationService,
  NotificationType,
} from '../../../core/notifications/notification.service';
import { Icon, IconName } from '../icon/icon';

const TOAST_ICON: Record<NotificationType, { name: IconName; color: string }> = {
  success: { name: 'check', color: 'text-emerald-600 dark:text-emerald-400' },
  error: { name: 'alert', color: 'text-red-600 dark:text-red-400' },
  warning: { name: 'alert', color: 'text-amber-600 dark:text-amber-400' },
  info: { name: 'info', color: 'text-sky-600 dark:text-sky-400' },
};

@Component({
  selector: 'app-toast-container',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      @for (toast of notifications.items(); track toast.id) {
        <div
          class="card pointer-events-auto flex w-full max-w-sm items-start gap-3 p-4 shadow-lg"
          [attr.role]="toast.type === 'error' ? 'alert' : 'status'"
        >
          <app-icon
            [name]="icons[toast.type].name"
            [iconClass]="'size-5 ' + icons[toast.type].color"
          />
          <p class="flex-1 text-sm">{{ toast.message }}</p>
          <button
            type="button"
            class="btn-icon -m-1 size-7"
            (click)="notifications.dismiss(toast.id)"
            aria-label="Cerrar notificación"
          >
            <app-icon name="x" iconClass="size-4" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainer {
  protected readonly notifications = inject(NotificationService);
  protected readonly icons = TOAST_ICON;
}
