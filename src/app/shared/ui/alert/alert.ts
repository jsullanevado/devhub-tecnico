import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon, IconName } from '../icon/icon';

export type AlertType = 'error' | 'success' | 'warning' | 'info';

const STYLES: Record<AlertType, { icon: IconName; classes: string }> = {
  error: {
    icon: 'alert',
    classes:
      'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200',
  },
  success: {
    icon: 'check',
    classes:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200',
  },
  warning: {
    icon: 'alert',
    classes:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200',
  },
  info: {
    icon: 'info',
    classes:
      'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-200',
  },
};

/** Mensaje en línea. Los errores se anuncian de inmediato a lectores de pantalla. */
@Component({
  selector: 'app-alert',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '[attr.role]': "type() === 'error' ? 'alert' : 'status'" },
  template: `
    <div class="flex gap-3 rounded-md border p-3 text-sm" [class]="style().classes">
      <app-icon [name]="style().icon" iconClass="size-5 shrink-0" />
      <div class="min-w-0 flex-1"><ng-content /></div>
    </div>
  `,
})
export class Alert {
  readonly type = input<AlertType>('info');
  protected readonly style = computed(() => STYLES[this.type()]);
}
