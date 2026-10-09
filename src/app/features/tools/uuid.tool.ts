import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { inputChecked, inputValue } from '../../shared/utils/dom-events';
import { Alert } from '../../shared/ui/alert/alert';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { clampCount } from './lib/random';
import { generateUuids, inspectUuid } from './lib/uuid';
import { ToolNotice } from './tool-notice';
import { ValueList } from './value-list';

const MAX_COUNT = 100;

@Component({
  selector: 'app-uuid-tool',
  imports: [PageHeader, ToolNotice, ValueList, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl space-y-6">
      <app-page-header
        title="Generador de UUID v4"
        description="Identificadores aleatorios generados con crypto.randomUUID()."
        backLink="/tools"
        backLabel="Herramientas"
      />
      <app-tool-notice />

      <section class="card space-y-4 p-5" aria-labelledby="uuid-generate">
        <h2 id="uuid-generate" class="font-semibold">Generar</h2>
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <label for="uuid-count" class="label">Cantidad (1–{{ maxCount }})</label>
            <input
              id="uuid-count"
              type="number"
              min="1"
              [max]="maxCount"
              class="input mt-1 w-28"
              [value]="count()"
              (input)="onCount($event)"
            />
          </div>
          <label class="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              class="size-4 accent-indigo-600"
              [checked]="uppercase()"
              (change)="uppercase.set(inputChecked($event))"
            />
            Mayúsculas
          </label>
          <label class="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              class="size-4 accent-indigo-600"
              [checked]="hyphens()"
              (change)="hyphens.set(inputChecked($event))"
            />
            Con guiones
          </label>
          <button type="button" class="btn btn-primary" (click)="generate()">Generar</button>
        </div>
        <app-value-list [values]="results()" />
      </section>

      <section class="card space-y-3 p-5" aria-labelledby="uuid-validate">
        <h2 id="uuid-validate" class="font-semibold">Validar</h2>
        <div>
          <label for="uuid-validate-input" class="label">UUID</label>
          <input
            id="uuid-validate-input"
            type="text"
            maxlength="40"
            autocomplete="off"
            spellcheck="false"
            class="input mt-1 font-mono"
            (input)="toValidate.set(inputValue($event))"
          />
        </div>
        @if (inspection(); as info) {
          <app-alert [type]="info.valid ? 'success' : 'error'">
            @if (info.valid) {
              UUID válido · versión {{ info.version }} ·
              {{ info.standardVariant ? 'variante RFC 9562' : 'variante no estándar' }}
            } @else {
              No es un UUID válido (32 dígitos hexadecimales, con o sin guiones).
            }
          </app-alert>
        }
      </section>
    </div>
  `,
})
export class UuidTool {
  protected readonly inputValue = inputValue;
  protected readonly inputChecked = inputChecked;
  protected readonly maxCount = MAX_COUNT;
  protected readonly count = signal(5);
  protected readonly uppercase = signal(false);
  protected readonly hyphens = signal(true);
  protected readonly results = signal<string[]>([]);
  protected readonly toValidate = signal('');
  protected readonly inspection = computed(() =>
    this.toValidate().trim() ? inspectUuid(this.toValidate()) : null,
  );

  protected onCount(event: Event): void {
    this.count.set(Number((event.target as HTMLInputElement).value));
  }

  protected generate(): void {
    const count = clampCount(this.count(), 1, MAX_COUNT);
    this.count.set(count);
    this.results.set(
      generateUuids(count, { uppercase: this.uppercase(), hyphens: this.hyphens() }),
    );
  }
}
