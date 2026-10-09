import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { inputValue } from '../../shared/utils/dom-events';
import { Alert } from '../../shared/ui/alert/alert';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import {
  formatCardNumber,
  generateTestCardData,
  luhnCheck,
  TEST_CARDS,
  TestCardData,
} from './lib/test-cards';
import { ToolNotice } from './tool-notice';

@Component({
  selector: 'app-test-cards-tool',
  imports: [PageHeader, ToolNotice, CopyButton, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl space-y-6">
      <app-page-header
        title="Tarjetas de prueba"
        description="Números publicados por pasarelas de pago para sus entornos sandbox."
        backLink="/tools"
        backLabel="Herramientas"
      />
      <app-tool-notice />

      <section class="card overflow-hidden" aria-labelledby="cards-table">
        <h2 id="cards-table" class="px-5 pt-5 font-semibold">Números de prueba</h2>
        <p class="px-5 pt-1 text-sm text-slate-600 dark:text-slate-400">
          Solo funcionan en entornos de prueba (p. ej. modo test de Stripe). Usa cualquier fecha
          futura y cualquier CVC.
        </p>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-sm">
            <thead
              class="bg-slate-50 text-left text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"
            >
              <tr>
                <th scope="col" class="px-5 py-2 font-medium">Marca</th>
                <th scope="col" class="px-5 py-2 font-medium">Número</th>
                <th scope="col" class="px-5 py-2"><span class="sr-only">Copiar</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
              @for (card of cards; track card.number) {
                <tr>
                  <td class="px-5 py-2">{{ card.brand }}</td>
                  <td class="px-5 py-2 font-mono">{{ format(card.number) }}</td>
                  <td class="px-5 py-1 text-right">
                    <app-copy-button [text]="card.number" [compact]="true" label="Copiar número" />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card space-y-4 p-5" aria-labelledby="cards-generate">
        <h2 id="cards-generate" class="font-semibold">Datos completos de prueba</h2>
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label for="card-brand" class="label">Marca</label>
            <select id="card-brand" class="input mt-1 w-auto" (change)="onBrand($event)">
              @for (card of cards; track card.number; let index = $index) {
                <option [value]="index" [selected]="index === brandIndex()">
                  {{ card.brand }}
                </option>
              }
            </select>
          </div>
          <button type="button" class="btn btn-primary" (click)="generate()">Generar</button>
        </div>
        @if (generated(); as data) {
          <dl
            class="grid gap-3 rounded-md border border-slate-200 p-4 text-sm sm:grid-cols-2 dark:border-slate-800"
          >
            <div>
              <dt class="text-slate-500">Número</dt>
              <dd class="font-mono">{{ format(data.number) }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Titular (ficticio)</dt>
              <dd>{{ data.holder }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">Vencimiento</dt>
              <dd class="font-mono">{{ data.expiry }}</dd>
            </div>
            <div>
              <dt class="text-slate-500">CVC</dt>
              <dd class="font-mono">{{ data.cvc }}</dd>
            </div>
          </dl>
          <app-copy-button [text]="generatedJson()" label="Copiar como JSON" />
        }
      </section>

      <section class="card space-y-3 p-5" aria-labelledby="cards-luhn">
        <h2 id="cards-luhn" class="font-semibold">Validar con Luhn</h2>
        <div>
          <label for="card-luhn-input" class="label">Número de tarjeta</label>
          <input
            id="card-luhn-input"
            type="text"
            inputmode="numeric"
            maxlength="23"
            autocomplete="off"
            class="input mt-1 font-mono sm:w-80"
            (input)="toValidate.set(inputValue($event))"
          />
        </div>
        @if (luhn(); as result) {
          <app-alert [type]="result.valid ? 'success' : 'error'">{{ result.message }}</app-alert>
        }
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Solo comprueba el dígito de control; no indica si una tarjeta existe. No introduzcas
          tarjetas reales.
        </p>
      </section>
    </div>
  `,
})
export class TestCardsTool {
  protected readonly inputValue = inputValue;
  protected readonly cards = TEST_CARDS;
  protected readonly format = formatCardNumber;
  protected readonly brandIndex = signal(0);
  protected readonly generated = signal<TestCardData | null>(null);
  protected readonly generatedJson = computed(() =>
    JSON.stringify({ ...this.generated(), testData: true }, null, 2),
  );
  protected readonly toValidate = signal('');
  protected readonly luhn = computed(() => {
    const value = this.toValidate().trim();
    if (!value) {
      return null;
    }
    return luhnCheck(value)
      ? { valid: true, message: 'El número supera la validación Luhn.' }
      : { valid: false, message: 'El número no supera la validación Luhn (12–19 dígitos).' };
  });

  protected onBrand(event: Event): void {
    this.brandIndex.set(Number((event.target as HTMLSelectElement).value) || 0);
  }

  protected generate(): void {
    this.generated.set(generateTestCardData(TEST_CARDS[this.brandIndex()] ?? TEST_CARDS[0]));
  }
}
