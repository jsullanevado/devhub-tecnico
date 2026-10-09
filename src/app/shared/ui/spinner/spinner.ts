import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex', role: 'status' },
  template: `
    <svg
      class="animate-spin"
      [class.size-4]="size() === 'sm'"
      [class.size-6]="size() === 'md'"
      [class.size-10]="size() === 'lg'"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <span class="sr-only">{{ label() }}</span>
  `,
})
export class Spinner {
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly label = input('Cargando…');
}
