import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toAppError } from '../../core/errors/error-mapper';
import { NotificationService } from '../../core/notifications/notification.service';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { BulkImportService, ImportReport } from './bulk-import.service';

@Component({
  selector: 'app-bulk-import-page',
  imports: [RouterLink, PageHeader, Alert, Icon, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl space-y-6">
      <app-page-header
        title="Carga masiva"
        description="Registra servicios, operaciones, conexiones y objetos desde un archivo Excel."
      />

      <section class="card p-5" aria-labelledby="export-title">
        <h2 id="export-title" class="font-semibold">Exportar registros propios</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Exporta servicios, operaciones, conexiones y objetos para editarlos y volver a importarlos.
          Los secretos se excluyen salvo que marques la casilla.
        </p>
        <label class="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="size-4 accent-indigo-600"
            [checked]="includeSecrets()"
            (change)="includeSecrets.set(!includeSecrets())"
          />
          Incluir contraseñas y secretos
        </label>
        <button
          type="button"
          class="btn btn-primary mt-3"
          [disabled]="busy()"
          (click)="exportAll()"
        >
          <app-icon name="download" iconClass="size-4" /> Exportar Excel
        </button>
        @if (exportInfo(); as info) {
          <p class="mt-2 text-sm text-slate-600 dark:text-slate-400" role="status">{{ info }}</p>
        }
      </section>

      <section class="card p-5" aria-labelledby="template-title">
        <h2 id="template-title" class="font-semibold">1. Descarga la plantilla</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Incluye hojas para Conexiones, Objetos, Servicios, Operaciones, Llamadas y UsoBD. Las filas
          que empiezan por <code class="font-mono">EJEMPLO_</code> se ignoran.
        </p>
        <button
          type="button"
          class="btn btn-secondary mt-3"
          [disabled]="busy()"
          (click)="downloadTemplate()"
        >
          <app-icon name="download" iconClass="size-4" /> Descargar plantilla
        </button>
      </section>

      <section class="card p-5" aria-labelledby="file-title">
        <h2 id="file-title" class="font-semibold">2. Revisa el archivo completado</h2>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <label class="btn btn-primary cursor-pointer" [class.opacity-50]="busy()">
            <app-icon name="upload" iconClass="size-4" /> Elegir archivo .xlsx
            <input
              type="file"
              class="sr-only"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Archivo Excel de carga masiva"
              [disabled]="busy()"
              (change)="onFile($event)"
            />
          </label>
          @if (fileName(); as name) {
            <span class="text-sm text-slate-600 dark:text-slate-400">{{ name }}</span>
          }
          @if (busy()) {
            <app-spinner size="sm" [label]="busyLabel()" />
          }
        </div>
        @if (error(); as message) {
          <app-alert type="error" class="mt-4">{{ message }}</app-alert>
        }
      </section>

      @if (report(); as result) {
        <section class="card p-5" aria-labelledby="review-title">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="review-title" class="font-semibold">
              {{ result.applied ? 'Carga completada' : '3. Revisa y confirma' }}
            </h2>
            @if (!result.applied) {
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="busy() || result.errorCount > 0 || !hasChanges()"
                (click)="apply()"
              >
                <app-icon name="check" iconClass="size-4" /> Importar
              </button>
            }
          </div>

          @if (result.applied) {
            <app-alert type="success" class="mt-4">
              Se guardó todo. Revisa los datos en
              <a class="link" routerLink="/services">Servicios</a>,
              <a class="link" routerLink="/databases">Bases de datos</a> o
              <a class="link" routerLink="/reports">Reportes</a>.
            </app-alert>
          } @else if (result.errorCount) {
            <app-alert type="error" class="mt-4">
              Hay {{ result.errorCount }} {{ result.errorCount === 1 ? 'error' : 'errores' }}.
              Corrígelos en Excel y vuelve a seleccionar el archivo; no se guardará nada hasta
              resolverlos.
            </app-alert>
          } @else if (!hasChanges()) {
            <app-alert type="info" class="mt-4">
              El archivo no contiene filas para cargar.
              @if (result.summary.examplesSkipped) {
                Se ignoraron {{ result.summary.examplesSkipped }} filas de ejemplo.
              }
            </app-alert>
          }

          <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            @for (item of summaryItems(); track item.label) {
              <div class="rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
                <dt class="text-slate-500 dark:text-slate-400">{{ item.label }}</dt>
                <dd class="mt-1 font-semibold tabular-nums">{{ item.value }}</dd>
              </div>
            }
          </dl>

          @if (result.errors.length) {
            <h3 class="mt-6 font-medium text-red-700 dark:text-red-300">Errores</h3>
            <div class="mt-2 overflow-x-auto">
              <table class="w-full text-left text-sm" aria-label="Errores de la carga">
                <thead class="text-xs uppercase text-slate-500">
                  <tr><th class="px-2 py-1">Hoja</th><th class="px-2 py-1">Fila</th><th class="px-2 py-1">Problema</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  @for (issue of result.errors; track $index) {
                    <tr><td class="px-2 py-1">{{ issue.sheet }}</td><td class="px-2 py-1 tabular-nums">{{ issue.row }}</td><td class="px-2 py-1">{{ issue.message }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }

          @if (result.warnings.length) {
            <h3 class="mt-6 font-medium text-amber-700 dark:text-amber-300">Avisos</h3>
            <ul class="mt-2 space-y-1 text-sm" aria-label="Avisos de la carga">
              @for (issue of result.warnings; track $index) {
                <li><span class="text-slate-500">{{ issue.sheet }} · fila {{ issue.row }}:</span> {{ issue.message }}</li>
              }
            </ul>
          }
        </section>
      }
    </div>
  `,
})
export class BulkImportPage {
  private readonly importer = inject(BulkImportService);
  private readonly notifications = inject(NotificationService);

  protected readonly busy = signal(false);
  protected readonly busyLabel = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly report = signal<ImportReport | null>(null);
  protected readonly includeSecrets = signal(false);
  protected readonly exportInfo = signal<string | null>(null);
  private file: File | null = null;

  protected readonly hasChanges = computed(() => {
    const summary = this.report()?.summary;
    if (!summary) return false;
    const { examplesSkipped: _examples, ...counts } = summary;
    return Object.values(counts).some((value) => value > 0);
  });

  protected readonly summaryItems = computed(() => {
    const summary = this.report()?.summary;
    if (!summary) return [];
    return [
      { label: 'Servicios nuevos / actualizados', value: `${summary.servicesNew} / ${summary.servicesUpdated}` },
      { label: 'Operaciones nuevas / actualizadas', value: `${summary.operationsNew} / ${summary.operationsUpdated}` },
      { label: 'Llamadas entre servicios', value: summary.calls },
      { label: 'Usos de objetos de BD', value: summary.dbUses },
      { label: 'Conexiones nuevas / actualizadas', value: `${summary.connectionsNew} / ${summary.connectionsUpdated}` },
      { label: 'Objetos nuevos / actualizados', value: `${summary.objectsNew} / ${summary.objectsUpdated}` },
      { label: 'SP / funciones añadidos', value: summary.membersNew },
      { label: 'Filas de ejemplo ignoradas', value: summary.examplesSkipped },
    ];
  });

  protected async downloadTemplate(): Promise<void> {
    await this.run('Generando plantilla…', async () => {
      await this.importer.downloadTemplate();
      this.notifications.success('Plantilla descargada.');
    });
  }

  protected async exportAll(): Promise<void> {
    this.exportInfo.set(null);
    await this.run('Exportando…', async () => {
      const result = await this.importer.exportAll(this.includeSecrets());
      this.exportInfo.set(
        `Exportado: ${result.counts['servicios']} servicios, ${result.counts['operaciones']} operaciones, ${result.counts['conexiones']} conexiones.` +
          (result.skipped.length ? ` ${result.skipped.length} texto(s) superaron el límite de una celda.` : ''),
      );
      this.notifications.success('Exportación lista.');
    });
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.report.set(null);
    this.error.set(null);
    this.fileName.set(file.name);
    this.file = file;
    await this.run('Revisando el Excel…', async () => {
      this.report.set(await this.importer.preview(file));
    });
  }

  protected async apply(): Promise<void> {
    if (!this.file) return;
    await this.run('Importando…', async () => {
      const result = await this.importer.apply(this.file!);
      this.report.set(result);
      if (result.applied) {
        this.file = null;
        this.notifications.success('Carga masiva completada.');
      }
    });
  }

  private async run(label: string, task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.busyLabel.set(label);
    this.error.set(null);
    try {
      await task();
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.busy.set(false);
    }
  }
}