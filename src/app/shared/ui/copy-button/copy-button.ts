import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { toAppError } from '../../../core/errors/error-mapper';
import { NotificationService } from '../../../core/notifications/notification.service';
import { copyToClipboard } from '../../utils/file-utils';
import { Icon } from '../icon/icon';

/** Botón "Copiar" con confirmación visual y anuncio accesible. `compact`: solo icono. */
@Component({
  selector: 'app-copy-button',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (compact()) {
      <button
        type="button"
        class="btn-icon size-8"
        [disabled]="!text()"
        [attr.aria-label]="copied() ? 'Copiado' : label() + ': ' + text()"
        [title]="copied() ? 'Copiado' : label()"
        (click)="copy()"
      >
        <app-icon [name]="copied() ? 'check' : 'copy'" iconClass="size-4" />
      </button>
    } @else {
      <button type="button" class="btn btn-secondary" [disabled]="!text()" (click)="copy()">
        <app-icon [name]="copied() ? 'check' : 'copy'" iconClass="size-4" />
        {{ copied() ? 'Copiado' : label() }}
      </button>
    }
    <span class="sr-only" aria-live="polite">{{ copied() ? 'Copiado al portapapeles' : '' }}</span>
  `,
})
export class CopyButton {
  private readonly notifications = inject(NotificationService);
  readonly text = input.required<string>();
  readonly label = input('Copiar');
  readonly compact = input(false);
  protected readonly copied = signal(false);
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  protected async copy(): Promise<void> {
    try {
      await copyToClipboard(this.text());
      this.copied.set(true);
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch (error) {
      this.notifications.error(toAppError(error).message);
    }
  }
}
