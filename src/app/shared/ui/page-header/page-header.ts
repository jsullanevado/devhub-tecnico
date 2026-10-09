import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';

/** Cabecera de página: enlace de vuelta opcional, título, descripción y acciones (contenido proyectado). */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (backLink()) {
      <a
        [routerLink]="backLink()"
        class="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <app-icon name="arrow-left" iconClass="size-4" />
        {{ backLabel() }}
      </a>
    }
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold break-words">{{ title() }}</h1>
        @if (description()) {
          <p class="mt-1 text-slate-600 dark:text-slate-400">{{ description() }}</p>
        }
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly backLink = input<string>();
  readonly backLabel = input('Volver');
}
