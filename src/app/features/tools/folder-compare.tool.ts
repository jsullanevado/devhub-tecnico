import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NotificationService } from '../../core/notifications/notification.service';
import { Alert } from '../../shared/ui/alert/alert';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { inputValue } from '../../shared/utils/dom-events';
import { downloadTextFile } from '../../shared/utils/file-utils';
import { FolderCompareService } from './folder-compare.service';
import {
  CompareProgress,
  FOLDER_COMPARE_EXCLUDED,
  FolderComparison,
  FolderSnapshot,
  parseExtraExclusions,
  toDisplayPath,
} from './lib/folder-compare';

/** Preferencia del usuario en este navegador (comodidad: si no hay almacenamiento, no se recuerda). */
const EXTRA_EXCLUDED_KEY = 'devhub.folderCompare.extraExcluded';

function readExtraExcluded(): string {
  try {
    return localStorage.getItem(EXTRA_EXCLUDED_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveExtraExcluded(text: string): void {
  try {
    localStorage.setItem(EXTRA_EXCLUDED_KEY, text);
  } catch {
    // Sin almacenamiento disponible (modo privado, bloqueado): no se recuerda.
  }
}

type Side = 'origin' | 'target';
type ResultTab = 'modified' | 'onlyInOrigin' | 'onlyInTarget';

const SIDE_LABELS: Record<Side, string> = {
  origin: 'Ruta Fuente 1 (Origen)',
  target: 'Ruta Fuente 2 (Destino)',
};

const TAB_LABELS: Record<ResultTab, string> = {
  modified: 'Modificados',
  onlyInOrigin: 'Solo en origen',
  onlyInTarget: 'Solo en destino',
};

@Component({
  selector: 'app-folder-compare-tool',
  imports: [PageHeader, Alert, CopyButton, Icon, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl space-y-6">
      <app-page-header
        title="Comparador de carpetas"
        description="Detecta los archivos cuyo contenido cambió entre dos carpetas o fuentes (hash SHA-256, sin depender de fechas)."
        backLink="/tools"
        backLabel="Herramientas"
      />
      <app-alert type="info">
        Las carpetas se leen <strong>en tu navegador</strong>: ningún archivo se sube a DevHub ni a
        otro servidor. El navegador te pedirá permiso para leer cada carpeta.
      </app-alert>

      <section class="card space-y-5 p-5" aria-labelledby="folders-title">
        <h2 id="folders-title" class="sr-only">Carpetas a comparar</h2>
        <div class="grid items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
          @for (side of sides; track side; let first = $first) {
            @if (!first) {
              <button
                type="button"
                class="btn-icon justify-self-center md:mb-1"
                aria-label="Intercambiar origen y destino"
                title="Intercambiar origen y destino"
                [disabled]="busy()"
                (click)="swap()"
              >
                <app-icon name="refresh" iconClass="size-5" />
              </button>
            }
            <div>
              <span class="label" [id]="side + '-label'">{{ sideLabels[side] }}</span>
              <div class="mt-1 flex gap-2">
                <div
                  class="input flex min-w-0 flex-1 items-center gap-2"
                  role="status"
                  [attr.aria-labelledby]="side + '-label'"
                >
                  <app-icon name="book" iconClass="size-4 shrink-0 text-slate-400" />
                  @if (scanning() === side) {
                    <span class="truncate text-slate-500 dark:text-slate-400">
                      Leyendo… {{ scanCount() }} archivos
                    </span>
                  } @else if (folders()[side]; as folder) {
                    <span class="truncate font-mono">{{ folder.name }}</span>
                    <span class="ms-auto shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {{ folder.files.length }} archivos
                    </span>
                  } @else {
                    <span class="truncate text-slate-400">Ninguna carpeta seleccionada</span>
                  }
                </div>
                <button
                  type="button"
                  class="btn btn-secondary shrink-0"
                  [disabled]="busy()"
                  (click)="pick(side, fallbackInput)"
                >
                  Seleccionar carpeta
                </button>
                <input
                  #fallbackInput
                  type="file"
                  class="hidden"
                  webkitdirectory
                  multiple
                  tabindex="-1"
                  aria-hidden="true"
                  (change)="onFallbackFiles(side, $event)"
                />
              </div>
            </div>
          }
        </div>

        <div class="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>Se ignoran siempre:</span>
          @for (name of excluded; track name) {
            <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">{{
              name
            }}</code>
          }
        </div>

        <div>
          <label for="extra-excluded" class="label"
            >Ignorar también estas carpetas (opcional)</label
          >
          <input
            id="extra-excluded"
            class="input mt-1 font-mono"
            placeholder="Release, packages, TestResults"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="extra-excluded-hint"
            [value]="extraText()"
            [disabled]="comparing()"
            (input)="onExtraExcluded(inputValue($event))"
          />
          <p id="extra-excluded-hint" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Nombres de carpeta separados por comas; se ignoran en cualquier nivel. Este navegador
            los recordará.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="!canCompare()"
            (click)="compare()"
          >
            @if (comparing()) {
              <app-spinner size="sm" label="Comparando…" />
            }
            Comparar carpetas
          </button>
          @if (comparing()) {
            <button type="button" class="btn btn-secondary" (click)="cancel()">Cancelar</button>
            @if (progress(); as current) {
              <div class="flex min-w-48 flex-1 items-center gap-3">
                <div
                  class="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                  role="progressbar"
                  aria-label="Progreso de la comparación"
                  aria-valuemin="0"
                  [attr.aria-valuemax]="current.total"
                  [attr.aria-valuenow]="current.done"
                >
                  <div
                    class="h-full rounded-full bg-indigo-600 transition-[width]"
                    [style.width.%]="current.total ? (current.done / current.total) * 100 : 0"
                  ></div>
                </div>
                <span class="shrink-0 text-sm tabular-nums text-slate-500 dark:text-slate-400">
                  {{ current.done }} / {{ current.total }}
                </span>
              </div>
            }
          }
        </div>
        @if (error(); as message) {
          <app-alert type="error">{{ message }}</app-alert>
        }
      </section>

      @if (result(); as result) {
        <section class="card p-5" aria-labelledby="result-title">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="result-title" class="text-sm font-medium text-slate-500 dark:text-slate-400">
                Archivos modificados
              </h2>
              <p class="text-4xl font-semibold tabular-nums" data-testid="modified-count">
                {{ result.modified.length }}
              </p>
            </div>
            <dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
              <div class="flex gap-1">
                <dt>Comparados:</dt>
                <dd class="font-medium tabular-nums">{{ result.compared }}</dd>
              </div>
              <div class="flex gap-1">
                <dt>Idénticos:</dt>
                <dd class="font-medium tabular-nums">{{ result.identical }}</dd>
              </div>
              <div class="flex gap-1">
                <dt>Tiempo:</dt>
                <dd class="font-medium tabular-nums">{{ seconds(result.durationMs) }} s</dd>
              </div>
            </dl>
          </div>

          <div
            class="mt-5 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800"
            role="tablist"
          >
            @for (item of tabs; track item) {
              <button
                type="button"
                role="tab"
                class="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
                [class]="
                  tab() === item
                    ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                "
                [attr.aria-selected]="tab() === item"
                aria-controls="compare-list"
                (click)="selectTab(item)"
              >
                {{ tabLabels[item] }} ({{ result[item].length }})
              </button>
            }
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="search"
              class="input min-w-48 flex-1"
              placeholder="Filtrar rutas…"
              aria-label="Filtrar rutas de la lista"
              [value]="filter()"
              (input)="filter.set(inputValue($event))"
            />
            <app-copy-button [text]="listText()" label="Copiar lista" />
            <button
              type="button"
              class="btn btn-secondary"
              [disabled]="visible().length === 0"
              (click)="download()"
            >
              <app-icon name="download" iconClass="size-4" /> Descargar .txt
            </button>
          </div>

          @if (visible().length === 0) {
            <p class="mt-4 text-sm text-slate-500 dark:text-slate-400" role="status">
              @if (filter()) {
                Ninguna ruta coincide con el filtro.
              } @else if (tab() === 'modified') {
                No hay archivos modificados: los archivos comunes tienen el mismo contenido.
              } @else {
                No hay archivos en esta categoría.
              }
            </p>
          } @else {
            <ol
              id="compare-list"
              role="tabpanel"
              class="mt-4 max-h-[60vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-sm dark:border-slate-800 dark:bg-slate-950"
            >
              @for (path of visible(); track path) {
                <li class="break-all py-0.5">{{ path }}</li>
              }
            </ol>
          }
        </section>
      }
    </div>
  `,
})
export class FolderCompareTool {
  private readonly service = inject(FolderCompareService);
  private readonly notifications = inject(NotificationService);

  protected readonly sides: readonly Side[] = ['origin', 'target'];
  protected readonly sideLabels = SIDE_LABELS;
  protected readonly tabs: readonly ResultTab[] = ['modified', 'onlyInOrigin', 'onlyInTarget'];
  protected readonly tabLabels = TAB_LABELS;
  protected readonly excluded = FOLDER_COMPARE_EXCLUDED;
  protected readonly inputValue = inputValue;

  protected readonly folders = signal<Record<Side, FolderSnapshot | null>>({
    origin: null,
    target: null,
  });
  protected readonly scanning = signal<Side | null>(null);
  protected readonly scanCount = signal(0);
  protected readonly comparing = signal(false);
  protected readonly progress = signal<CompareProgress | null>(null);
  protected readonly result = signal<FolderComparison | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly tab = signal<ResultTab>('modified');
  protected readonly filter = signal('');
  protected readonly extraText = signal(readExtraExcluded());

  private abort: AbortController | null = null;

  protected readonly busy = computed(() => this.comparing() || this.scanning() !== null);
  protected readonly canCompare = computed(
    () => !this.busy() && !!this.folders().origin && !!this.folders().target,
  );
  /** Rutas de la pestaña activa, filtradas y en formato "\carpeta\archivo". */
  protected readonly visible = computed(() => {
    const result = this.result();
    if (!result) {
      return [];
    }
    const filter = this.filter().trim().toLowerCase();
    return result[this.tab()]
      .map(toDisplayPath)
      .filter((path) => !filter || path.toLowerCase().includes(filter));
  });
  protected readonly listText = computed(() => this.visible().join('\n'));

  protected async pick(side: Side, fallbackInput: HTMLInputElement): Promise<void> {
    if (!this.service.supportsDirectoryPicker) {
      fallbackInput.value = '';
      fallbackInput.click();
      return;
    }
    this.error.set(null);
    this.scanning.set(side);
    this.scanCount.set(0);
    try {
      const folder = await this.service.pickDirectory(`devhub-compare-${side}`, (count) =>
        this.scanCount.set(count),
      );
      if (folder) {
        this.setFolder(side, folder);
      }
    } catch (error) {
      this.error.set(`No se pudo leer la carpeta: ${describe(error)}`);
    } finally {
      this.scanning.set(null);
    }
  }

  protected onFallbackFiles(side: Side, event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    const folder = files ? this.service.fromFileList(files) : null;
    if (folder) {
      this.setFolder(side, folder);
    }
  }

  /** Cambiar las exclusiones invalida el resultado anterior (no hace falta volver a elegir carpetas). */
  protected onExtraExcluded(text: string): void {
    this.extraText.set(text);
    saveExtraExcluded(text);
    this.result.set(null);
  }

  protected swap(): void {
    this.folders.update(({ origin, target }) => ({ origin: target, target: origin }));
    this.result.set(null);
  }

  protected async compare(): Promise<void> {
    const { origin, target } = this.folders();
    if (!origin || !target || this.busy()) {
      return;
    }
    this.abort = new AbortController();
    this.comparing.set(true);
    this.error.set(null);
    this.result.set(null);
    this.progress.set(null);
    try {
      const result = await this.service.compare(origin, target, {
        signal: this.abort.signal,
        onProgress: (progress) => this.progress.set(progress),
        extraExcluded: parseExtraExclusions(this.extraText()),
      });
      this.result.set(result);
      this.tab.set('modified');
      this.filter.set('');
    } catch (error) {
      if (!this.abort.signal.aborted) {
        this.error.set(
          `No se pudo completar la comparación: ${describe(error)}. Si moviste o borraste archivos, vuelve a seleccionar las carpetas.`,
        );
      }
    } finally {
      this.comparing.set(false);
      this.abort = null;
    }
  }

  protected cancel(): void {
    this.abort?.abort();
    this.notifications.info('Comparación cancelada.');
  }

  protected selectTab(tab: ResultTab): void {
    this.tab.set(tab);
    this.filter.set('');
  }

  protected download(): void {
    const name = `comparacion-${TAB_LABELS[this.tab()].toLowerCase().replace(/\s+/g, '-')}.txt`;
    downloadTextFile(name, this.listText() + '\n');
    this.notifications.success(`Descargado como ${name}.`);
  }

  protected seconds(ms: number): string {
    return (ms / 1000).toLocaleString('es', { maximumFractionDigits: 1 });
  }

  private setFolder(side: Side, folder: FolderSnapshot): void {
    this.folders.update((folders) => ({ ...folders, [side]: folder }));
    this.result.set(null);
    this.error.set(null);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
