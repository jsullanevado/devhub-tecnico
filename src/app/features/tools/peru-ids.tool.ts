import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { inputValue } from '../../shared/utils/dom-events';
import { Alert } from '../../shared/ui/alert/alert';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import {
  generatePeruId,
  PERU_ID_TYPES,
  PeruIdType,
  validateDniFormat,
  validateRuc,
} from './lib/peru-ids';
import { clampCount } from './lib/random';
import { ToolNotice } from './tool-notice';
import { ValueList } from './value-list';

const MAX_COUNT = 50;

@Component({
  selector: 'app-peru-ids-tool',
  imports: [PageHeader, ToolNotice, ValueList, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl space-y-6">
      <app-page-header
        title="DNI y RUC sintéticos"
        description="Identificadores peruanos ficticios para datos de prueba."
        backLink="/tools"
        backLabel="Herramientas"
      />
      <app-tool-notice />

      <section class="card space-y-4 p-5" aria-labelledby="peru-generate">
        <h2 id="peru-generate" class="font-semibold">Generar</h2>
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label for="peru-type" class="label">Tipo</label>
            <select id="peru-type" class="input mt-1 w-auto" (change)="onType($event)">
              @for (option of types; track option.value) {
                <option [value]="option.value" [selected]="option.value === type()">
                  {{ option.label }}
                </option>
              }
            </select>
          </div>
          <div>
            <label for="peru-count" class="label">Cantidad (1–{{ maxCount }})</label>
            <input
              id="peru-count"
              type="number"
              min="1"
              [max]="maxCount"
              class="input mt-1 w-28"
              [value]="count()"
              (input)="onCount($event)"
            />
          </div>
          <button type="button" class="btn btn-primary" (click)="generate()">Generar</button>
        </div>
        <app-value-list [values]="results()" />
      </section>

      <section class="card space-y-3 p-5" aria-labelledby="peru-validate">
        <h2 id="peru-validate" class="font-semibold">Validar</h2>
        <div>
          <label for="peru-validate-input" class="label">DNI (8 dígitos) o RUC (11 dígitos)</label>
          <input
            id="peru-validate-input"
            type="text"
            inputmode="numeric"
            maxlength="13"
            autocomplete="off"
            class="input mt-1 font-mono sm:w-72"
            (input)="toValidate.set(inputValue($event))"
          />
        </div>
        @if (validation(); as result) {
          <app-alert [type]="result.valid ? 'success' : 'error'">{{ result.message }}</app-alert>
        }
        <p class="text-xs text-slate-500 dark:text-slate-400">
          La validación comprueba formato y dígito verificador; no consulta si el documento existe.
        </p>
      </section>
    </div>
  `,
})
export class PeruIdsTool {
  protected readonly inputValue = inputValue;
  protected readonly types = PERU_ID_TYPES;
  protected readonly maxCount = MAX_COUNT;
  protected readonly type = signal<PeruIdType>('dni');
  protected readonly count = signal(5);
  protected readonly results = signal<string[]>([]);
  protected readonly toValidate = signal('');

  protected readonly validation = computed(() => {
    const value = this.toValidate().replace(/\s/g, '');
    if (!value) {
      return null;
    }
    return value.length === 11 ? validateRuc(value) : validateDniFormat(value);
  });

  protected onType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const match = PERU_ID_TYPES.find((option) => option.value === value);
    if (match) {
      this.type.set(match.value);
    }
  }

  protected onCount(event: Event): void {
    this.count.set(Number((event.target as HTMLInputElement).value));
  }

  protected generate(): void {
    const count = clampCount(this.count(), 1, MAX_COUNT);
    this.count.set(count);
    this.results.set(Array.from({ length: count }, () => generatePeruId(this.type())));
  }
}
