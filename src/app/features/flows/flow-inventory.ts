import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon/icon';
import { FlowInventory, FlowInventoryRow } from './flows.models';

/**
 * Cuadro de insumos de la página: SP, DataPower y servicios a los que llega cada método,
 * con la operación WCF intermedia. ⚠ = ningún evento de la página llama a ese método.
 */
@Component({
  selector: 'app-flow-inventory',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-6' },
  template: `
    @let inv = inventory();
    <div class="flex flex-wrap items-center gap-3">
      <input
        type="search"
        class="input w-full sm:w-80"
        placeholder="Filtrar por método, operación, SP, llave…"
        aria-label="Filtrar el cuadro de insumos"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
      <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          class="size-4 accent-indigo-600"
          [checked]="onlyReachable()"
          (change)="onlyReachable.set(!onlyReachable())"
        />
        Solo métodos que se llaman desde la página
      </label>
      <button type="button" class="btn btn-primary ms-auto" (click)="exportExcel.emit()">
        <app-icon name="download" iconClass="size-4" /> Exportar a Excel
      </button>
    </div>
    <p class="text-xs text-slate-500 dark:text-slate-400">
      Totales: {{ inv.sp.length }} SP · {{ inv.datapower.length }} DataPower ·
      {{ inv.services.length }} servicios. ⚠ = ningún evento de la página llama a ese método. Pasa
      el ratón por una fila para ver su origen en el código.
    </p>

    <section aria-labelledby="inv-sp">
      <h3 id="inv-sp" class="font-semibold">1. Stored procedures ({{ sp().length }})</h3>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-left text-sm" aria-label="Stored procedures">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800/60">
            <tr>
              <th class="px-2 py-1.5">#</th>
              <th class="px-2 py-1.5">Método en la página</th>
              <th class="px-2 py-1.5">Operación WCF</th>
              <th class="px-2 py-1.5">Paquete.SP</th>
              <th class="px-2 py-1.5">Conexión</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            @for (row of sp(); track $index) {
              <tr [title]="row.doc">
                <td class="px-2 py-1 tabular-nums">{{ $index + 1 }}</td>
                <td class="px-2 py-1">{{ row.method }}{{ row.reachable ? '' : ' ⚠' }}</td>
                <td class="px-2 py-1">{{ row.wcf ?? '—' }}</td>
                <td class="px-2 py-1 font-mono text-xs break-all">{{ row.name }}</td>
                <td class="px-2 py-1">{{ row.connection ?? '—' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="px-2 py-3 text-slate-500">Sin stored procedures.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="inv-dp">
      <h3 id="inv-dp" class="font-semibold">2. DataPower ({{ datapower().length }})</h3>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-left text-sm" aria-label="DataPower">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800/60">
            <tr>
              <th class="px-2 py-1.5">#</th>
              <th class="px-2 py-1.5">Método en la página</th>
              <th class="px-2 py-1.5">Operación WCF</th>
              <th class="px-2 py-1.5">Clase backend</th>
              <th class="px-2 py-1.5">Llave de URL</th>
              <th class="px-2 py-1.5">Tipo</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            @for (row of datapower(); track $index) {
              <tr [title]="row.doc">
                <td class="px-2 py-1 tabular-nums">{{ $index + 1 }}</td>
                <td class="px-2 py-1">{{ row.method }}{{ row.reachable ? '' : ' ⚠' }}</td>
                <td class="px-2 py-1">{{ row.wcf ?? '—' }}</td>
                <td class="px-2 py-1">{{ row.backendClass ?? '—' }}</td>
                <td class="px-2 py-1">
                  <code class="font-mono text-xs">{{ row.key ?? '—' }}</code>
                  @if (row.url) {
                    <span
                      class="block max-w-xs truncate text-xs text-slate-500"
                      [title]="row.url"
                      >{{ row.url }}</span
                    >
                  }
                </td>
                <td class="px-2 py-1">{{ row.kind }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="px-2 py-3 text-slate-500">Sin DataPower.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="inv-ws">
      <h3 id="inv-ws" class="font-semibold">
        3. Otros servicios SOAP / REST ({{ services().length }})
      </h3>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-left text-sm" aria-label="Otros servicios">
          <thead class="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800/60">
            <tr>
              <th class="px-2 py-1.5">#</th>
              <th class="px-2 py-1.5">Método en la página</th>
              <th class="px-2 py-1.5">Operación WCF</th>
              <th class="px-2 py-1.5">Servicio / método final</th>
              <th class="px-2 py-1.5">Llave de URL</th>
              <th class="px-2 py-1.5">Tipo</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            @for (row of services(); track $index) {
              <tr [title]="row.doc">
                <td class="px-2 py-1 tabular-nums">{{ $index + 1 }}</td>
                <td class="px-2 py-1">{{ row.method }}{{ row.reachable ? '' : ' ⚠' }}</td>
                <td class="px-2 py-1">{{ row.wcf ?? '—' }}</td>
                <td class="px-2 py-1 font-mono text-xs break-all">{{ row.name }}</td>
                <td class="px-2 py-1">
                  <code class="font-mono text-xs">{{ row.key ?? '—' }}</code>
                  @if (row.url) {
                    <span
                      class="block max-w-xs truncate text-xs text-slate-500"
                      [title]="row.url"
                      >{{ row.url }}</span
                    >
                  }
                </td>
                <td class="px-2 py-1">{{ row.kind }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="px-2 py-3 text-slate-500">Sin otros servicios.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="inv-empty">
      <h3 id="inv-empty" class="font-semibold">
        4. Métodos sin base de datos ni servicio ({{ empty().length }})
      </h3>
      @if (empty().length) {
        <ul class="mt-2 flex flex-wrap gap-2 text-sm">
          @for (item of empty(); track $index) {
            <li
              class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs dark:bg-slate-800"
              [title]="item.doc"
            >
              {{ item.method }}{{ item.reachable ? '' : ' ⚠' }}
            </li>
          }
        </ul>
      } @else {
        <p class="mt-2 text-sm text-slate-500">Ninguno.</p>
      }
    </section>
  `,
})
export class FlowInventoryView {
  readonly inventory = input.required<FlowInventory>();
  readonly exportExcel = output<void>();

  protected readonly query = signal('');
  protected readonly onlyReachable = signal(false);

  private filter(rows: FlowInventoryRow[]): FlowInventoryRow[] {
    const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (this.onlyReachable() && !row.reachable) return false;
      const text = [
        row.method,
        row.wcf,
        row.name,
        row.key,
        row.url,
        row.backendClass,
        row.connection,
      ]
        .join(' ')
        .toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }

  protected readonly sp = computed(() => this.filter(this.inventory().sp));
  protected readonly datapower = computed(() => this.filter(this.inventory().datapower));
  protected readonly services = computed(() => this.filter(this.inventory().services));
  protected readonly empty = computed(() => {
    const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    return this.inventory().empty.filter(
      (item) =>
        (!this.onlyReachable() || item.reachable) &&
        words.every((word) => item.method.toLowerCase().includes(word)),
    );
  });
}
