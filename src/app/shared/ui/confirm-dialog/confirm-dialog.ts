import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  viewChild,
} from '@angular/core';
import { ConfirmService } from '../../../core/notifications/confirm.service';

/**
 * Diálogo modal nativo (<dialog>): bloquea el fondo, atrapa el foco, cierra con
 * Esc y devuelve el foco al elemento que lo abrió. El foco inicial va a "Cancelar".
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="card m-auto w-[calc(100%-2rem)] max-w-md p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50 dark:text-slate-100"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      (cancel)="onCancel($event)"
      (click)="onBackdropClick($event)"
    >
      @if (confirm.current(); as pending) {
        <div class="p-6">
          <h2 id="confirm-title" class="text-lg font-semibold">{{ pending.title }}</h2>
          <p id="confirm-message" class="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {{ pending.message }}
          </p>
          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              #cancelButton
              class="btn btn-secondary"
              (click)="confirm.settle(false)"
            >
              {{ pending.cancelLabel }}
            </button>
            <button
              type="button"
              class="btn"
              [class.btn-primary]="pending.tone === 'default'"
              [class.btn-danger]="pending.tone === 'danger'"
              (click)="confirm.settle(true)"
            >
              {{ pending.confirmLabel }}
            </button>
          </div>
        </div>
      }
    </dialog>
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    // Tras renderizar: el contenido ya existe al abrir y se puede enfocar "Cancelar".
    afterRenderEffect(() => {
      const dialog = this.dialog().nativeElement;
      const isPending = this.confirm.current() !== null;
      if (isPending && !dialog.open) {
        dialog.showModal();
        this.cancelButton()?.nativeElement.focus();
      } else if (!isPending && dialog.open) {
        dialog.close();
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.confirm.settle(false);
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.confirm.settle(false);
    }
  }
}
