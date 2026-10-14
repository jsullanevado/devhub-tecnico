import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toAppError } from '../../core/errors/error-mapper';
import { NotificationService } from '../../core/notifications/notification.service';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { FlowDiagram } from './flow-diagram';
import { FlowInventoryView } from './flow-inventory';
import {
  FLOW_LANES,
  FlowAnalysis,
  FlowDiagram as Diagram,
  FlowEvent,
  FlowLane,
} from './flows.models';
import { FlowsService } from './flows.service';

const MAX_LISTED_PAGES = 200;

const stepCount = (event: FlowEvent) =>
  event.groups.reduce((sum, group) => sum + group.steps.length, 0);

/**
 * Flujos BPMN desde el código: elige un .aspx o .cshtml de un repositorio, analiza sus
 * eventos y genera el diagrama Front · DataPower · Servicio · BD para Bizagi.
 */
@Component({
  selector: 'app-flows-page',
  imports: [PageHeader, Alert, Icon, Spinner, FlowDiagram, FlowInventoryView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-7xl space-y-6">
      <app-page-header
        title="Flujos BPMN"
        description="Genera el flujo Front · DataPower · Servicio · BD de una página .aspx o .cshtml leyendo el código, y descárgalo para Bizagi."
      />

      <section class="card space-y-4 p-5" aria-labelledby="source-title">
        <h2 id="source-title" class="font-semibold">1. Repositorio y página</h2>
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
                multiple
                aria-label="Carpeta del repositorio"
                [disabled]="busy()"
                (change)="onFolderFiles($event)"
              />
            </label>
          }
          @if (repoName(); as name) {
            <span class="text-sm text-slate-600 dark:text-slate-400"
              >{{ name }} · {{ pages().length }} páginas</span
            >
          }
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Usa la carpeta que contiene la solución completa (front, negocio, datos y Web.config): así
          se pueden seguir las llamadas entre capas. El código se lee en tu navegador (Chrome o
          Edge); nada se sube. Solo se consulta lo que ya tienes registrado en DevHub.
        </p>

        @if (pages().length) {
          <div>
            <input
              type="search"
              class="input"
              placeholder="Buscar página (p. ej. Bloqueo, ChangeOwnership)…"
              aria-label="Buscar página"
              [value]="pageQuery()"
              (input)="pageQuery.set($any($event.target).value)"
            />
            <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {{ filteredPages().length }} de {{ pages().length }} páginas
              @if (filteredPages().length > maxListed) {
                · se muestran las primeras {{ maxListed }}: afina la búsqueda
              }
            </p>
            <ul
              class="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800"
              aria-label="Páginas del repositorio"
            >
              @for (page of filteredPages().slice(0, maxListed); track page) {
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    [class]="
                      page === selectedPage()
                        ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200'
                        : ''
                    "
                    [attr.aria-pressed]="page === selectedPage()"
                    (click)="selectedPage.set(page)"
                  >
                    <span class="badge shrink-0">{{
                      page.endsWith('.aspx') ? 'WebForms' : 'MVC'
                    }}</span>
                    <span class="truncate">{{ page }}</span>
                  </button>
                </li>
              }
            </ul>
          </div>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="busy() || !selectedPage()"
            (click)="analyze()"
          >
            <app-icon name="search" iconClass="size-4" /> Analizar página
          </button>
        }
        @if (busy()) {
          <app-spinner size="sm" [label]="busyLabel()" />
        }
        @if (error(); as message) {
          <app-alert type="error">{{ message }}</app-alert>
        }
      </section>

      @if (analysis(); as result) {
        <section class="card space-y-4 p-5" aria-labelledby="events-title">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="events-title" class="font-semibold">2. {{ pageName() }}</h2>
            <div
              class="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700"
              role="group"
              aria-label="Vista del análisis"
            >
              @for (option of views; track option.value) {
                <button
                  type="button"
                  class="rounded px-3 py-1 text-sm"
                  [class]="
                    view() === option.value
                      ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  "
                  [attr.aria-pressed]="view() === option.value"
                  (click)="view.set(option.value)"
                >
                  {{ option.label }}
                </button>
              }
            </div>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400" data-testid="flow-stats">
            {{ result.kind === 'mvc' ? 'MVC' : 'WebForms' }} · {{ result.stats.files }} archivos ·
            {{ result.stats.methods }} métodos · {{ result.stats.ms }} ms
          </p>
          @for (warning of result.warnings; track warning) {
            <app-alert type="warning">{{ warning }}</app-alert>
          }
          @if (view() === 'inventory') {
            <app-flow-inventory [inventory]="result.inventory" (exportExcel)="exportInventory()" />
          } @else if (result.events.length) {
            <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                class="size-4 accent-indigo-600"
                [checked]="showEmpty()"
                (change)="showEmpty.set(!showEmpty())"
              />
              Mostrar también los eventos sin llamadas a servicios ni BD
            </label>
            <div class="flex flex-wrap gap-2" role="tablist" aria-label="Eventos">
              @for (event of visibleEvents(); track event.id) {
                <button
                  type="button"
                  role="tab"
                  class="rounded-md border px-3 py-1.5 text-sm"
                  [class]="
                    event.id === selectedEventId()
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200'
                      : 'border-slate-300 hover:border-indigo-300 dark:border-slate-700'
                  "
                  [attr.aria-selected]="event.id === selectedEventId()"
                  (click)="selectEvent(event)"
                >
                  {{ event.trigger }}
                  <span class="ms-1 text-xs opacity-70">{{ count(event) }} pasos</span>
                </button>
              }
            </div>
          }
        </section>
      }

      @if (view() === 'diagram' && editable(); as event) {
        <section class="card space-y-4 p-5" aria-labelledby="diagram-title">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="diagram-title" class="font-semibold">3. Diagrama · {{ event.trigger }}</h2>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="!currentDiagram()"
                (click)="downloadCurrent()"
              >
                <app-icon name="download" iconClass="size-4" /> Descargar este .bpmn
              </button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!diagrams().length"
                (click)="downloadAll()"
              >
                <app-icon name="download" iconClass="size-4" />
                {{ diagrams().length > 1 ? 'Descargar todos (.zip)' : 'Descargar .bpmn' }}
              </button>
            </div>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Entrada: <code class="font-mono">{{ event.entry }}</code> · Borrador generado a partir
            del código: revisa y corrige los pasos abajo antes de usarlo.
          </p>

          @if (diagrams().length > 1) {
            <div class="flex flex-wrap gap-2" role="tablist" aria-label="Diagramas">
              @for (diagram of diagrams(); track diagram.id) {
                <button
                  type="button"
                  role="tab"
                  class="rounded-md px-2.5 py-1 text-sm"
                  [class]="
                    diagram.id === currentDiagram()?.id
                      ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
                  "
                  [attr.aria-selected]="diagram.id === currentDiagram()?.id"
                  (click)="diagramId.set(diagram.id)"
                >
                  {{ diagram.subprocess ? diagram.name.split(' · ')[0] : 'Principal' }}
                </button>
              }
            </div>
          }
          @if (currentDiagram(); as diagram) {
            <app-flow-diagram [layout]="diagram.layout" (openSubprocess)="openSub($event)" />
          } @else if (building()) {
            <app-spinner label="Dibujando…" />
          }

          <details class="rounded-md border border-slate-200 dark:border-slate-800" open>
            <summary class="cursor-pointer px-4 py-2 text-sm font-medium">
              Pasos ({{ count(event) }}) · edita nombres o carriles y el diagrama se regenera
            </summary>
            <div class="space-y-4 p-4">
              @for (group of event.groups; track $index; let g = $index) {
                <div class="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <div class="flex items-center gap-2">
                    <span class="badge">Front</span>
                    <input
                      class="input flex-1 py-1 font-mono text-sm"
                      [value]="group.name"
                      [attr.aria-label]="'Nombre del tramo ' + (g + 1)"
                      (change)="renameGroup(g, $any($event.target).value)"
                    />
                    <button
                      type="button"
                      class="btn-icon text-red-600 dark:text-red-400"
                      [attr.aria-label]="'Quitar tramo ' + (g + 1)"
                      (click)="removeGroup(g)"
                    >
                      <app-icon name="trash" iconClass="size-4" />
                    </button>
                  </div>
                  <ul class="mt-2 space-y-1.5">
                    @for (step of group.steps; track $index; let s = $index) {
                      <li class="flex flex-wrap items-center gap-2 ps-4">
                        <select
                          class="input w-32 py-1 text-sm"
                          [value]="step.lane"
                          [attr.aria-label]="'Carril del paso ' + (s + 1) + ' del tramo ' + (g + 1)"
                          (change)="setLane(g, s, $any($event.target).value)"
                        >
                          @for (lane of lanes; track lane.id) {
                            <option [value]="lane.id">{{ lane.name }}</option>
                          }
                        </select>
                        <input
                          class="input min-w-48 flex-1 py-1 font-mono text-sm"
                          [value]="step.name"
                          [title]="step.doc ?? ''"
                          [attr.aria-label]="'Paso ' + (s + 1) + ' del tramo ' + (g + 1)"
                          (change)="renameStep(g, s, $any($event.target).value)"
                        />
                        <button
                          type="button"
                          class="btn-icon text-red-600 dark:text-red-400"
                          [attr.aria-label]="'Quitar paso ' + (s + 1) + ' del tramo ' + (g + 1)"
                          (click)="removeStep(g, s)"
                        >
                          <app-icon name="x" iconClass="size-4" />
                        </button>
                        @if (step.doc) {
                          <span class="w-full ps-34 text-xs text-slate-500 dark:text-slate-400">{{
                            step.doc
                          }}</span>
                        }
                      </li>
                    }
                  </ul>
                </div>
              } @empty {
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  Este evento no llama a servicios ni a la BD.
                </p>
              }
            </div>
          </details>
        </section>
      }
    </div>
  `,
})
export class FlowsPage {
  protected readonly flows = inject(FlowsService);
  private readonly notifications = inject(NotificationService);

  protected readonly lanes = FLOW_LANES;
  protected readonly views = [
    { value: 'diagram', label: 'Diagrama por evento' },
    { value: 'inventory', label: 'Cuadro de insumos' },
  ] as const;
  protected readonly view = signal<'diagram' | 'inventory'>('diagram');
  protected readonly maxListed = MAX_LISTED_PAGES;
  protected readonly repoName = signal('');
  protected readonly pages = signal<string[]>([]);
  protected readonly pageQuery = signal('');
  protected readonly selectedPage = signal<string | null>(null);
  protected readonly analysis = signal<FlowAnalysis | null>(null);
  protected readonly showEmpty = signal(false);
  protected readonly selectedEventId = signal<string | null>(null);
  /** Copia editable del evento elegido. */
  protected readonly editable = signal<FlowEvent | null>(null);
  protected readonly diagrams = signal<Diagram[]>([]);
  protected readonly diagramId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly building = signal(false);
  protected readonly busyLabel = signal('');
  protected readonly error = signal<string | null>(null);
  private buildSeq = 0;

  protected readonly filteredPages = computed(() => {
    const words = this.pageQuery().toLowerCase().split(/\s+/).filter(Boolean);
    return this.pages().filter((page) => words.every((word) => page.toLowerCase().includes(word)));
  });
  protected readonly visibleEvents = computed(() =>
    (this.analysis()?.events ?? []).filter((event) => this.showEmpty() || stepCount(event) > 0),
  );
  protected readonly pageName = computed(() => this.analysis()?.page.split('/').pop() ?? '');
  protected readonly currentDiagram = computed(
    () => this.diagrams().find((diagram) => diagram.id === this.diagramId()) ?? this.diagrams()[0],
  );

  protected count(event: FlowEvent): number {
    return stepCount(event);
  }

  protected async pickFolder(): Promise<void> {
    await this.run('Leyendo la carpeta…', async () => {
      const name = await this.flows.pickDirectory((files) =>
        this.busyLabel.set(`Leyendo la carpeta… ${files} archivos`),
      );
      if (name) this.setRepository(name);
    });
  }

  protected async onFolderFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;
    await this.run('Leyendo la carpeta…', async () => {
      const name = await this.flows.fromFileList(files, (count) =>
        this.busyLabel.set(`Leyendo la carpeta… ${count} archivos`),
      );
      input.value = '';
      if (name) this.setRepository(name);
    });
  }

  private setRepository(name: string): void {
    const pages = this.flows.listPages();
    this.repoName.set(name);
    this.pages.set(pages);
    this.selectedPage.set(null);
    this.analysis.set(null);
    this.editable.set(null);
    this.diagrams.set([]);
    if (!pages.length) {
      this.error.set('No hay páginas .aspx ni .cshtml en esa carpeta.');
    }
  }

  protected async analyze(): Promise<void> {
    const page = this.selectedPage();
    if (!page) return;
    await this.run('Analizando el código…', async () => {
      const result = this.flows.analyze(page);
      this.analysis.set(result);
      this.editable.set(null);
      this.diagrams.set([]);
      const first = result.events.find((event) => stepCount(event) > 0) ?? result.events[0];
      if (first) {
        if (!stepCount(first)) this.showEmpty.set(true);
        await this.selectEvent(first);
      }
    });
  }

  protected async selectEvent(event: FlowEvent): Promise<void> {
    this.selectedEventId.set(event.id);
    this.editable.set(structuredClone(event));
    this.diagramId.set(null);
    await this.rebuild();
  }

  protected openSub(name: string): void {
    const code = name.split(' · ')[0];
    const found = this.diagrams().find(
      (diagram) => diagram.subprocess && diagram.name.startsWith(code),
    );
    if (found) this.diagramId.set(found.id);
  }

  // --- Edición de pasos (el diagrama se regenera) -------------------------------------

  private edit(change: (event: FlowEvent) => void): void {
    const event = this.editable();
    if (!event) return;
    const copy = structuredClone(event);
    change(copy);
    copy.groups = copy.groups.filter((group) => group.steps.length);
    this.editable.set(copy);
    void this.rebuild();
  }

  protected renameGroup(g: number, name: string): void {
    this.edit((event) => (event.groups[g].name = name.trim() || event.groups[g].name));
  }
  protected removeGroup(g: number): void {
    this.edit((event) => event.groups.splice(g, 1));
  }
  protected renameStep(g: number, s: number, name: string): void {
    this.edit((event) => {
      const step = event.groups[g].steps[s];
      step.name = name.trim() || step.name;
      step.url = null; // nombre puesto a mano: no se vuelve a cruzar con DevHub
    });
  }
  protected setLane(g: number, s: number, lane: FlowLane): void {
    this.edit((event) => {
      const step = event.groups[g].steps[s];
      step.lane = lane;
      delete step.type; // el tipo de tarea lo decide el carril
    });
  }
  protected removeStep(g: number, s: number): void {
    this.edit((event) => event.groups[g].steps.splice(s, 1));
  }

  private async rebuild(): Promise<void> {
    const event = this.editable();
    if (!event) return;
    const seq = ++this.buildSeq;
    this.building.set(true);
    try {
      const diagrams = await this.flows.build(this.pageName(), event);
      if (seq !== this.buildSeq) return;
      this.diagrams.set(diagrams);
      if (!diagrams.some((diagram) => diagram.id === this.diagramId())) this.diagramId.set(null);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      if (seq === this.buildSeq) this.building.set(false);
    }
  }

  /** Cuadro de insumos de la página en Excel. */
  protected async exportInventory(): Promise<void> {
    const analysis = this.analysis();
    if (!analysis) return;
    await this.run('Exportando…', async () => {
      const fileName = await this.flows.downloadInventory(analysis);
      this.notifications.success('Descargado ' + fileName + '.');
    });
  }

  // --- Descargas ---------------------------------------------------------------------

  protected downloadCurrent(): void {
    const diagram = this.currentDiagram();
    if (!diagram) return;
    this.flows.downloadDiagram(diagram);
    this.notifications.success(`Descargado ${diagram.fileName}.`);
  }

  protected async downloadAll(): Promise<void> {
    const event = this.editable();
    if (!event) return;
    if (this.diagrams().length === 1) {
      this.downloadCurrent();
      return;
    }
    await this.run('Preparando el ZIP…', async () => {
      const fileName = await this.flows.downloadZip(this.pageName(), event);
      this.notifications.success(
        `Descargado ${fileName} (${this.diagrams().length} diagramas).`,
      );
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
