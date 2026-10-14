import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RelationsService } from '../../core/data/relations.service';
import { DATABASE_ENVIRONMENTS } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  buildObjectRows,
  buildTraceRows,
  ObjectRow,
  toCsv,
  TraceRow,
} from '../../shared/relations/relations';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { oneOf } from '../../shared/resources/list-query';
import { LoadState } from '../../shared/resources/load-state';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { downloadTextFile } from '../../shared/utils/file-utils';

type View = 'operations' | 'objects';
type TraceStatus = 'all' | 'db' | 'no-db' | 'orphan';
type UsageStatus = 'all' | 'used' | 'unused';

/** Opciones de «Filas por página» (el CSV exporta todas las filtradas). */
const PAGE_SIZES = [25, 50, 100, 200] as const;

const includes = (values: string[], query: string) =>
  values.some((value) => value.toLowerCase().includes(query));

/** Reportes de trazabilidad: servicio → destino → conexión → objeto → SP, con filtros. */
@Component({
  selector: 'app-reports-page',
  imports: [RouterLink, LoadState, PageHeader, Icon, Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-7xl">
      <app-page-header
        title="Reportes"
        description="Todo lo registrado en Servicios y Bases de datos, con filtros y exportación a Excel (CSV)."
      />

      <div class="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Tipo de reporte">
        <button
          type="button"
          role="tab"
          class="btn"
          [class]="view() === 'operations' ? 'btn-primary' : 'btn-secondary'"
          [attr.aria-selected]="view() === 'operations'"
          (click)="view.set('operations')"
        >
          Por operación de servicio
        </button>
        <button
          type="button"
          role="tab"
          class="btn"
          [class]="view() === 'objects' ? 'btn-primary' : 'btn-secondary'"
          [attr.aria-selected]="view() === 'objects'"
          (click)="view.set('objects')"
        >
          Por objeto de BD
        </button>
      </div>

      <app-load-state [state]="loader.state()" backLink="/dashboard">
        <section class="card mt-4 space-y-3 p-4" aria-label="Filtros">
          <div class="relative">
            <app-icon
              name="search"
              class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
              iconClass="size-4"
            />
            <input
              type="search"
              class="input ps-9"
              placeholder="Buscar en todas las columnas…"
              aria-label="Buscar en el reporte"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            @if (view() === 'operations') {
              <select
                class="input w-auto"
                aria-label="Tipo de servicio"
                [value]="kind()"
                (change)="kind.set($any($event.target).value)"
              >
                <option value="">Todos los tipos</option>
                <option value="DataPower">DataPower</option>
                <option value="REST">REST</option>
                <option value="SOAP">SOAP</option>
              </select>
              <select
                class="input w-auto"
                aria-label="Relación"
                [value]="traceStatus()"
                (change)="traceStatus.set($any($event.target).value)"
              >
                <option value="all">Todas las operaciones</option>
                <option value="db">Llegan a una BD</option>
                <option value="no-db">No llegan a ninguna BD</option>
                <option value="orphan">Sin destino ni BD</option>
              </select>
            } @else {
              <select
                class="input w-auto"
                aria-label="Uso"
                [value]="usageStatus()"
                (change)="usageStatus.set($any($event.target).value)"
              >
                <option value="all">Todos los objetos</option>
                <option value="used">Usados por algún servicio</option>
                <option value="unused">Sin uso registrado</option>
              </select>
            }
            <select
              class="input w-auto"
              aria-label="Conexión"
              [value]="database()"
              (change)="database.set($any($event.target).value)"
            >
              <option value="">Todas las conexiones</option>
              @for (item of databases(); track item.id) {
                <option [value]="item.id">{{ item.title }}</option>
              }
            </select>
            <select
              class="input w-auto"
              aria-label="Entorno"
              [value]="environment()"
              (change)="environment.set($any($event.target).value)"
            >
              <option value="">Todos los entornos</option>
              @for (item of environments; track item.value) {
                <option [value]="item.label">{{ item.label }}</option>
              }
            </select>
            <span class="ms-auto text-sm text-slate-500 dark:text-slate-400" role="status">
              {{ count() }} {{ count() === 1 ? 'fila' : 'filas' }}
            </span>
            <button type="button" class="btn btn-secondary" (click)="clear()">Limpiar</button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!count()"
              (click)="exportCsv()"
            >
              <app-icon name="download" iconClass="size-4" /> Exportar CSV
            </button>
          </div>
        </section>

        <div #tableTop class="card mt-4 scroll-mt-4 overflow-x-auto">
          @if (view() === 'operations') {
            <table class="w-full text-left text-sm" aria-label="Reporte por operación">
              <thead
                class="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
              >
                <tr>
                  <th class="px-3 py-2 whitespace-nowrap">Tipo</th>
                  <th class="px-3 py-2 whitespace-nowrap">Servicio</th>
                  <th class="px-3 py-2 whitespace-nowrap">Operación</th>
                  <th class="px-3 py-2 whitespace-nowrap">Llama a</th>
                  <th class="px-3 py-2 whitespace-nowrap">Conexión</th>
                  <th class="px-3 py-2 whitespace-nowrap">Entorno</th>
                  <th class="px-3 py-2 whitespace-nowrap">Objeto</th>
                  <th class="px-3 py-2 whitespace-nowrap">SP / función</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                @for (row of renderedTrace(); track $index) {
                  <tr class="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td class="px-3 py-2">
                      <span class="badge">{{ row.kind }}</span>
                    </td>
                    <td class="px-3 py-2">
                      <a class="link" [routerLink]="['/services', row.serviceId]">{{
                        row.service
                      }}</a>
                    </td>
                    <td class="px-3 py-2 font-mono">{{ row.operation }}</td>
                    <td class="px-3 py-2">
                      @if (row.targetId && row.route) {
                        <a class="link" [routerLink]="['/services', row.targetId]">{{
                          row.route
                        }}</a>
                      } @else {
                        <span class="text-slate-400">—</span>
                      }
                    </td>
                    <td class="px-3 py-2">
                      @if (row.databaseId) {
                        <a class="link" [routerLink]="['/databases', row.databaseId]">{{
                          row.database
                        }}</a>
                      } @else {
                        <span class="text-slate-400">{{ row.database || '—' }}</span>
                      }
                    </td>
                    <td class="px-3 py-2">{{ row.environment }}</td>
                    <td class="px-3 py-2 font-mono">
                      @if (row.objectType) {
                        <span class="badge me-1 font-mono">{{ row.objectType }}</span>
                      }
                      {{ row.object }}
                    </td>
                    <td class="px-3 py-2 font-mono">{{ row.member }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8" class="px-3 py-8 text-center text-slate-500">
                      Ninguna fila coincide con los filtros.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <table class="w-full text-left text-sm" aria-label="Reporte por objeto de BD">
              <thead
                class="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
              >
                <tr>
                  <th class="px-3 py-2 whitespace-nowrap">Conexión</th>
                  <th class="px-3 py-2 whitespace-nowrap">Entorno</th>
                  <th class="px-3 py-2 whitespace-nowrap">Tipo</th>
                  <th class="px-3 py-2 whitespace-nowrap">Objeto</th>
                  <th class="px-3 py-2 whitespace-nowrap">SP / función</th>
                  <th class="px-3 py-2 whitespace-nowrap">Descripción</th>
                  <th class="px-3 py-2 whitespace-nowrap">Lo usan</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                @for (row of renderedObjects(); track $index) {
                  <tr class="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td class="px-3 py-2">
                      <a class="link" [routerLink]="['/databases', row.databaseId]">{{
                        row.database
                      }}</a>
                    </td>
                    <td class="px-3 py-2">{{ row.environment }}</td>
                    <td class="px-3 py-2">
                      <span class="badge font-mono">{{ row.objectType }}</span>
                    </td>
                    <td class="px-3 py-2 font-mono">{{ row.object }}</td>
                    <td class="px-3 py-2 font-mono">{{ row.member }}</td>
                    <td class="px-3 py-2">{{ row.description }}</td>
                    <td class="px-3 py-2">
                      @for (usage of row.usedBy; track $index) {
                        <a class="link block" [routerLink]="['/services', usage.serviceId]">{{
                          usage.label
                        }}</a>
                      } @empty {
                        <span class="text-slate-400">Sin uso registrado</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="px-3 py-8 text-center text-slate-500">
                      Ninguna fila coincide con los filtros.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
        <app-pagination
          class="mt-4 block"
          [page]="page()"
          [pageSize]="pageSize()"
          [total]="count()"
          [pageSizes]="pageSizes"
          (pageChange)="goToPage($event)"
          (pageSizeChange)="pageSize.set($event)"
        />
      </app-load-state>
    </div>
  `,
})
export class ReportsPage {
  private readonly relations = inject(RelationsService);
  private readonly notifications = inject(NotificationService);

  protected readonly loader = createAsyncLoader(
    () => true,
    () => this.relations.graph(),
  );
  protected readonly environments = DATABASE_ENVIRONMENTS;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly pageSize = signal<number>(50);
  private readonly tableTop = viewChild<ElementRef<HTMLElement>>('tableTop');

  // Filtros iniciales desde la URL (p. ej. los pendientes del Inicio): ?view=objects&usage=unused
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly view = signal<View>(
    oneOf(this.params.get('view'), ['operations', 'objects'] as const) ?? 'operations',
  );
  protected readonly query = signal(this.params.get('q') ?? '');
  protected readonly kind = signal(
    oneOf(this.params.get('kind'), ['DataPower', 'REST', 'SOAP'] as const) ?? '',
  );
  protected readonly database = signal('');
  protected readonly environment = signal('');
  protected readonly traceStatus = signal<TraceStatus>(
    oneOf(this.params.get('status'), ['all', 'db', 'no-db', 'orphan'] as const) ?? 'all',
  );
  protected readonly usageStatus = signal<UsageStatus>(
    oneOf(this.params.get('usage'), ['all', 'used', 'unused'] as const) ?? 'all',
  );

  protected readonly databases = computed(() => this.loader.value()?.databases ?? []);
  private readonly traceRows = computed(() => {
    const graph = this.loader.value();
    return graph ? buildTraceRows(graph) : [];
  });
  private readonly objectRows = computed(() => {
    const graph = this.loader.value();
    return graph ? buildObjectRows(graph) : [];
  });

  protected readonly filteredTrace = computed(() => {
    const query = this.query().trim().toLowerCase();
    const kind = this.kind();
    const database = this.database();
    const environment = this.environment();
    const status = this.traceStatus();
    return this.traceRows().filter(
      (row) =>
        (!kind || row.kind === kind) &&
        (!database || row.databaseId === database) &&
        (!environment || row.environment === environment) &&
        (status === 'all' ||
          (status === 'db' && !!row.object) ||
          (status === 'no-db' && !row.object) ||
          (status === 'orphan' && !row.object && !row.route)) &&
        (!query ||
          includes(
            [
              row.kind,
              row.service,
              row.system,
              row.operation,
              row.route,
              row.database,
              row.object,
              row.member,
            ],
            query,
          )),
    );
  });

  protected readonly filteredObjects = computed(() => {
    const query = this.query().trim().toLowerCase();
    const database = this.database();
    const environment = this.environment();
    const status = this.usageStatus();
    return this.objectRows().filter(
      (row) =>
        (!database || row.databaseId === database) &&
        (!environment || row.environment === environment) &&
        (status === 'all' ||
          (status === 'used' && row.usedBy.length > 0) ||
          (status === 'unused' && row.usedBy.length === 0)) &&
        (!query ||
          includes(
            [
              row.database,
              row.objectType,
              row.object,
              row.member,
              row.description,
              ...row.usedBy.map((usage) => usage.label),
            ],
            query,
          )),
    );
  });

  protected readonly count = computed(() =>
    this.view() === 'operations' ? this.filteredTrace().length : this.filteredObjects().length,
  );
  /** Vuelve a la página 1 al cambiar la vista, los filtros o las filas por página. */
  protected readonly page = linkedSignal({
    source: () => [
      this.view(),
      this.view() === 'operations' ? this.filteredTrace() : this.filteredObjects(),
      this.pageSize(),
    ],
    computation: () => 1,
  });
  private pageSlice<T>(rows: T[]): T[] {
    const start = (this.page() - 1) * this.pageSize();
    return rows.slice(start, start + this.pageSize());
  }
  protected readonly renderedTrace = computed(() => this.pageSlice(this.filteredTrace()));
  protected readonly renderedObjects = computed(() => this.pageSlice(this.filteredObjects()));

  protected goToPage(page: number): void {
    this.page.set(page);
    this.tableTop()?.nativeElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  protected clear(): void {
    this.query.set('');
    this.kind.set('');
    this.database.set('');
    this.environment.set('');
    this.traceStatus.set('all');
    this.usageStatus.set('all');
  }

  protected exportCsv(): void {
    const date = new Date().toISOString().slice(0, 10);
    if (this.view() === 'operations') {
      const rows = this.filteredTrace().map((row: TraceRow) => [
        row.kind,
        row.system,
        row.service,
        row.operation,
        row.method,
        row.route,
        row.database,
        row.environment,
        row.objectType,
        row.object,
        row.member,
      ]);
      const csv = toCsv(
        [
          'Tipo',
          'Sistema',
          'Servicio',
          'Operación',
          'Método',
          'Llama a',
          'Conexión',
          'Entorno',
          'Tipo objeto',
          'Objeto',
          'SP / función',
        ],
        rows,
      );
      this.save(`reporte_operaciones_${date}.csv`, csv);
    } else {
      const rows = this.filteredObjects().map((row: ObjectRow) => [
        row.database,
        row.environment,
        row.objectType,
        row.object,
        row.member,
        row.description,
        row.usedBy.map((usage) => usage.label).join(' | '),
      ]);
      const csv = toCsv(
        ['Conexión', 'Entorno', 'Tipo', 'Objeto', 'SP / función', 'Descripción', 'Lo usan'],
        rows,
      );
      this.save(`reporte_objetos_bd_${date}.csv`, csv);
    }
  }

  private save(fileName: string, csv: string): void {
    downloadTextFile(fileName, csv, 'text/csv;charset=utf-8');
    this.notifications.success(`Exportado como ${fileName}.`);
  }
}
