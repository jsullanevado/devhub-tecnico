import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { ConfirmDialog } from './shared/ui/confirm-dialog/confirm-dialog';
import { ToastContainer } from './shared/ui/toast-container/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainer, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (navigating()) {
      <div
        class="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-indigo-500"
        role="progressbar"
        aria-label="Cargando página"
      ></div>
    }
    <router-outlet />
    <app-toast-container />
    <app-confirm-dialog />
  `,
})
export class App {
  /** Barra de progreso mientras se resuelven guards y se descargan chunks lazy. */
  protected readonly navigating = toSignal(
    inject(Router).events.pipe(
      filter(
        (event) =>
          event instanceof NavigationStart ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError,
      ),
      map((event) => event instanceof NavigationStart),
    ),
    { initialValue: false },
  );
}
