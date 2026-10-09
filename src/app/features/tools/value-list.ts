import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';

/** Lista de valores generados con copia individual y copia de todos. */
@Component({
  selector: 'app-value-list',
  imports: [CopyButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (values().length) {
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-slate-600 dark:text-slate-400" role="status">
          {{ values().length }} {{ values().length === 1 ? 'valor generado' : 'valores generados' }}
          (ficticios)
        </p>
        <app-copy-button [text]="allValues()" label="Copiar todos" />
      </div>
      <ul
        class="mt-3 max-h-96 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200 font-mono text-sm dark:divide-slate-800 dark:border-slate-800"
      >
        @for (value of values(); track $index) {
          <li class="flex items-center justify-between gap-2 px-3 py-1">
            <span class="break-all">{{ value }}</span>
            <app-copy-button [text]="value" [compact]="true" />
          </li>
        }
      </ul>
    }
  `,
})
export class ValueList {
  readonly values = input.required<readonly string[]>();
  protected readonly allValues = computed(() => this.values().join('\n'));
}
