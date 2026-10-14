import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toAppError } from '../../core/errors/error-mapper';
import { NotificationService } from '../../core/notifications/notification.service';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { FlowAnalysis, FlowEvent, FlowLane } from './flows.models';
import { FlowsService } from './flows.service';

const MAX_LISTED_PAGES = 200;
const LANES: { id: FlowLane; label: string; tone: string }[] = [
  { id: 'front', label: 'Front', tone: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900' },
  { id: 'datapower', label: 'DataPower', tone: 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30' },
  { id: 'servicio', label: 'Servicio', tone: 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30' },
  { id: 'bd', label: 'BD', tone: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' },
];

@Component({
  selector: 'app-flows-page',
  imports: [PageHeader, Alert, Icon, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-7xl space-y-6">
      <app-page-header
        title="Flujos BPMN"
        description="Analiza páginas ASP.NET en una carpeta local y genera borradores BPMN."
      />

      <section class="card space-y-4 p-5" aria-labelledby="source-title">
        <h2 id="source-title" class="font-semibold">1. Selecciona la carpeta del repositorio</h2>
        <div class="flex flex-wrap items-center gap-3">
          @if (flows.supportsDirectoryPicker) {
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="pickFolder()">
              <app-icon name="folder" iconClass="size-4" /> Elegir carpeta
            </button>
          } @else {
            <label class="btn btn-primary cursor-pointer" [class.opacity-50]="busy()">
              <app-icon name="folder" iconClass="size-4" /> Elegir carpeta
              <input
                type="file"
                class="sr-only"
                webkitdirectory
                directory
                multiple
                aria-label="Carpeta del repositorio"
                [disabled]="busy()"
                (change)="onFolderFiles($event)"
              />
            </label>
          }
          @if (repositoryName(); as name) {
            <span class="text-sm text-slate-600 dark:text-slate-400">{{ name }} · {{ pages().length }} páginas</span>
          }
          @if (busy()) { <app-spinner size="sm" [label]="busyLabel()" /> }
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Se leen archivos .aspx/.cshtml, código .cs/.vb y configuración localmente; nada se sube.
          Los resultados son heurísticos y deben revisarse antes de usarlos.
        </p>
        @if (error(); as message) { <app-alert type="error">{{ message }}</app-alert> }

        @if (pages().length) {
          <div class="space-y-3">
            <input
              type="search"
              class="input"
              placeholder="Filtrar páginas…"
              aria-label="Buscar página"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ filteredPages().length }} de {{ pages().length }} páginas
              @if (filteredPages().length > maxListed) { · se muestran las primeras {{ maxListed }} }
            </p>
            <ul class="max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800" aria-label="Páginas encontradas">
              @for (page of filteredPages().slice(0, maxListed); track page) {
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    [class.bg-indigo-50]="page === selectedPage()"
                    [attr.aria-pressed]="page === selectedPage()"
                    (click)="selectedPage.set(page)"
                  >
                    <span class="badge shrink-0">{{ page.endsWith('.aspx') ? 'WebForms' : 'MVC' }}</span>
                    <span class="truncate">{{ page }}</span>
                  </button>
                </li>
              }
            </ul>
            <button type="button" class="btn btn-primary" [disabled]="busy() || !selectedPage()" (click)="analyze()">
              <app-icon name="search" iconClass="size-4" /> Analizar página
            </button>
          </div>
        }
      </section>

      @if (analysis(); as result) {
        <section class="card space-y-4 p-5" aria-labelledby="analysis-title">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="analysis-title" class="font-semibold">2. {{ result.page }}</h2>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {{ result.kind === 'mvc' ? 'MVC' : 'WebForms' }} · {{ result.stats.files }} archivos ·
                {{ result.stats.methods }} métodos · {{ result.stats.ms }} ms
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              @if (selectedEvent(); as event) {
                <button type="button" class="btn btn-secondary" (click)="exportEvent(event)">
                  <app-icon name="download" iconClass="size-4" /> Descargar .bpmn
                </button>
              }
              <button type="button" class="btn btn-primary" [disabled]="!result.events.length" (click)="exportAll()">
                <app-icon name="download" iconClass="size-4" /> Descargar BPMN + insumos
              </button>
            </div>
          </div>
          @for (warning of result.warnings; track warning) { <app-alert type="warning">{{ warning }}</app-alert> }
          @if (result.events.length) {
            <div class="flex flex-wrap gap-2" role="tablist" aria-label="Eventos detectados">
              @for (event of result.events; track event.id) {
                <button
                  type="button"
                  role="tab"
                  class="rounded-md border px-3 py-1.5 text-sm"
                  [class.border-indigo-500]="event.id === selectedEventId()"
                  [class.bg-indigo-50]="event.id === selectedEventId()"
                  [attr.aria-selected]="event.id === selectedEventId()"
                  (click)="selectedEventId.set(event.id)"
                >
                  {{ event.trigger }} <span class="ms-1 text-xs opacity-70">{{ event.steps.length }} pasos</span>
                </button>
              }
            </div>
          }
          @if (selectedEvent(); as event) {
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Entrada detectada en <code class="font-mono">{{ event.entry }}</code>
            </p>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Vista previa de pasos por carril">
              @for (lane of lanes; track lane.id) {
                <section class="rounded-md border p-3 {{ lane.tone }}" [attr.aria-label]="lane.label">
                  <h3 class="text-sm font-semibold">{{ lane.label }}</h3>
                  <ol class="mt-2 space-y-2">
                    @for (step of event.steps; track $index) {
                      @if (step.lane === lane.id) {
                        <li class="rounded border border-slate-200 bg-white/80 p-2 text-sm dark:border-slate-700 dark:bg-slate-950/60">
                          <span class="font-medium">{{ step.name }}</span>
                          <span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">{{ step.doc }}</span>
                        </li>
                      }
                    }
                  </ol>
                </section>
              }
            </div>
          } @else {
            <p class="text-sm text-slate-500 dark:text-slate-400">No se detectaron eventos.</p>
          }
        </section>
      }
    </div>
  `,
})
export class FlowsPage {
  protected readonly flows = inject(FlowsService);
  private readonly notifications = inject(NotificationService);
  protected readonly lanes = LANES;
  protected readonly maxListed = MAX_LISTED_PAGES;
  protected readonly repositoryName = signal('');
  protected readonly pages = signal<string[]>([]);
  protected readonly selectedPage = signal('');
  protected readonly query = signal('');
  protected readonly analysis = signal<FlowAnalysis | null>(null);
  protected readonly selectedEventId = signal('');
  protected readonly busy = signal(false);
  protected readonly busyLabel = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly filteredPages = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.pages().filter((page) => !query || page.toLowerCase().includes(query));
  });
  protected readonly selectedEvent = computed(() =>
    this.analysis()?.events.find((event) => event.id === this.selectedEventId()) ?? this.analysis()?.events[0] ?? null,
  );

  protected async pickFolder(): Promise<void> {
    await this.run('Leyendo carpeta…', async () => {
      const name = await this.flows.pickDirectory();
      if (name) this.setRepository(name);
    });
  }

  protected async onFolderFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    input.value = '';
    if (!files) return;
    await this.run('Leyendo carpeta…', async () => {
      const name = await this.flows.fromFileList(files);
      if (name) this.setRepository(name);
    });
  }

  protected async analyze(): Promise<void> {
    const page = this.selectedPage();
    if (!page) return;
    await this.run('Analizando código…', async () => {
      const result = await this.flows.analyze(page);
      this.analysis.set(result);
      this.selectedEventId.set(result.events[0]?.id ?? '');
    });
  }

  protected async exportEvent(event: FlowEvent): Promise<void> {
    await this.run('Generando BPMN…', async () => this.flows.exportEvent(event));
  }

  protected async exportAll(): Promise<void> {
    const result = this.analysis();
    if (!result) return;
    await this.run('Preparando descargas…', async () => {
      await this.flows.exportAll(result);
      this.notifications.success('Diagramas e insumos descargados.');
    });
  }

  private setRepository(name: string): void {
    this.repositoryName.set(name);
    this.pages.set(this.flows.pages);
    this.selectedPage.set('');
    this.analysis.set(null);
    this.error.set(null);
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