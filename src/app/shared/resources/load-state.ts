import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Alert } from '../ui/alert/alert';
import { Spinner } from '../ui/spinner/spinner';
import { AsyncState } from './async-loader';

/** Carga y error de una vista de detalle/edición; el contenido se proyecta al terminar. */
@Component({
  selector: 'app-load-state',
  imports: [RouterLink, Alert, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @switch (state().status) {
      @case ('loading') {
        <div class="flex justify-center py-16"><app-spinner size="lg" /></div>
      }
      @case ('error') {
        <app-alert type="error">{{ state().error }}</app-alert>
        <a [routerLink]="backLink()" class="btn btn-secondary mt-4">{{ backLabel() }}</a>
      }
      @default {
        <ng-content />
      }
    }
  `,
})
export class LoadState {
  readonly state = input.required<AsyncState<unknown>>();
  readonly backLink = input.required<string>();
  readonly backLabel = input('Volver al listado');
}
