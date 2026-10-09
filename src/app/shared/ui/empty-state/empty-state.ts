import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, IconName } from '../icon/icon';

@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700"
    >
      <app-icon [name]="icon()" iconClass="size-10 text-slate-400" />
      <h2 class="mt-3 font-medium">{{ title() }}</h2>
      @if (message()) {
        <p class="mt-1 max-w-md text-sm text-slate-600 dark:text-slate-400">{{ message() }}</p>
      }
      <div class="mt-4 flex flex-wrap justify-center gap-2"><ng-content /></div>
    </div>
  `,
})
export class EmptyState {
  readonly icon = input<IconName>('inbox');
  readonly title = input.required<string>();
  readonly message = input('');
}
