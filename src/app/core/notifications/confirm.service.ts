import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' para acciones destructivas o irreversibles. */
  tone?: 'default' | 'danger';
}

export interface PendingConfirm extends Required<ConfirmOptions> {
  resolve: (confirmed: boolean) => void;
}

/** Confirmaciones modales basadas en promesas: `if (await confirm.ask({...})) { ... }`. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _current = signal<PendingConfirm | null>(null);
  readonly current = this._current.asReadonly();

  ask(options: ConfirmOptions): Promise<boolean> {
    // Una confirmación nueva cancela la anterior que siguiera abierta.
    this.settle(false);
    return new Promise<boolean>((resolve) => {
      this._current.set({
        confirmLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        tone: 'default',
        ...options,
        resolve,
      });
    });
  }

  settle(confirmed: boolean): void {
    const pending = this._current();
    if (pending) {
      this._current.set(null);
      pending.resolve(confirmed);
    }
  }
}
