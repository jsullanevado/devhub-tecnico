import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toAppError } from '../../core/errors/error-mapper';
import { NotificationService } from '../../core/notifications/notification.service';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { MDI_APPS, MDI_DEFAULT_EXCLUDES } from './mdi.catalog';
import { MdiChangedFile, MdiCompareResult, MdiConfig, MdiFields, MdiHistoryItem } from './mdi.models';
import { MdiService } from './mdi.service';

@Component({
  selector: 'app-mdi-page',
  imports: [DatePipe, PageHeader, Alert, Icon, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-7xl space-y-6">
      <app-page-header
        title="Generar MDI"
        description="Compara ramas de un clon local y genera el documento de pase en Word."
      />

      @if (error(); as message) { <app-alert type="error">{{ message }}</app-alert> }
      @if (!mdi.supportsDirectoryPicker) {
        <app-alert type="warning">El acceso a carpetas locales requiere Chrome o Edge en un contexto seguro (HTTPS o localhost).</app-alert>
      }

      <section class="card space-y-4 p-5" aria-labelledby="mdi-app-title">
        <h2 id="mdi-app-title" class="font-semibold">1. Aplicativo y plantilla</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="label" for="mdi-app">Aplicativo
            <select id="mdi-app" class="input mt-1" [value]="app()" (change)="selectApp($any($event.target).value)">
              @for (item of apps; track item.id) { <option [value]="item.id">{{ item.label }}</option> }
            </select>
          </label>
          <div>
            <span class="label">Plantilla Word</span>
            <div class="mt-1 flex flex-wrap items-center gap-3">
              @if (templateConfigured()) { <span class="badge">Configurada</span> } @else { <span class="badge">Sin plantilla</span> }
              <label class="btn btn-secondary cursor-pointer" [class.opacity-50]="busy()">
                <app-icon name="upload" iconClass="size-4" /> Seleccionar .docx
                <input type="file" class="sr-only" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" [disabled]="busy()" (change)="onTemplate($event)" />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="card space-y-4 p-5" aria-labelledby="mdi-repo-title">
        <h2 id="mdi-repo-title" class="font-semibold">2. Clon local y ramas</h2>
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn btn-secondary" [disabled]="busy() || !mdi.supportsDirectoryPicker" (click)="pickRepository()">
            <app-icon name="folder" iconClass="size-4" /> Elegir carpeta del clon
          </button>
          @if (repoName()) { <span class="text-sm text-slate-600 dark:text-slate-400">{{ repoName() }}</span> }
          <button type="button" class="btn btn-secondary" [disabled]="busy() || !repoName()" (click)="loadBranches()">
            <app-icon name="refresh" iconClass="size-4" /> Leer ramas
          </button>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          El navegador lee el clon local en modo solo lectura. Para actualizar ramas remotas, ejecuta
          <code class="font-mono">git fetch --all --prune</code> en tu terminal y vuelve a leerlas.
          El contenido del repositorio no se sube.
        </p>
        @if (branches().length) {
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="label" for="mdi-source">Rama origen
              <select id="mdi-source" class="input mt-1 font-mono" [value]="source()" (change)="source.set($any($event.target).value)">
                <option value="">Elige rama origen</option>
                @for (branch of branches(); track branch) { <option [value]="branch">{{ branch }}</option> }
              </select>
            </label>
            <label class="label" for="mdi-target">Rama destino
              <select id="mdi-target" class="input mt-1 font-mono" [value]="target()" (change)="target.set($any($event.target).value)">
                <option value="">Elige rama destino</option>
                @for (branch of branches(); track branch) { <option [value]="branch">{{ branch }}</option> }
              </select>
            </label>
          </div>
          <label class="label" for="mdi-excludes">Excluir rutas (separadas por coma)
            <input id="mdi-excludes" class="input mt-1 font-mono" [value]="excludes()" (input)="excludes.set($any($event.target).value)" />
          </label>
          <button type="button" class="btn btn-primary" [disabled]="busy() || !source() || !target() || source() === target()" (click)="compare()">
            @if (busy()) { <app-spinner size="sm" label="Comparando…" /> } @else { <app-icon name="compare" iconClass="size-4" /> }
            Comparar ramas
          </button>
        }
      </section>

      @if (result(); as comparison) {
        <section class="card space-y-4 p-5" aria-labelledby="mdi-files-title">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="mdi-files-title" class="font-semibold">3. Cambios</h2>
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{{ comparison.source }} → {{ comparison.target }} · {{ comparison.files.length }} archivos · {{ comparison.commits.length }} commits</p>
            </div>
            <button type="button" class="btn btn-primary" [disabled]="busy() || !templateConfigured()" (click)="generate()">
              <app-icon name="download" iconClass="size-4" /> Generar Word
            </button>
          </div>
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="text-xs uppercase text-slate-500"><tr><th class="px-2 py-2">Estado</th><th class="px-2 py-2">Archivo</th><th class="px-2 py-2">+</th><th class="px-2 py-2">−</th></tr></thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  @for (file of comparison.files; track file.path) {
                    <tr>
                      <td class="px-2 py-2"><span class="badge">{{ statusLabel(file.status) }}</span></td>
                      <td class="px-2 py-2"><button type="button" class="link max-w-sm truncate font-mono text-xs" (click)="loadDiff(file)">{{ file.path }}</button></td>
                      <td class="px-2 py-2 tabular-nums">{{ file.additions }}</td><td class="px-2 py-2 tabular-nums">{{ file.deletions }}</td>
                    </tr>
                  } @empty { <tr><td colspan="4" class="px-2 py-4 text-slate-500">Sin cambios para mostrar.</td></tr> }
                </tbody>
              </table>
            </div>
            <div class="min-h-48 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 dark:border-slate-800">
              <pre class="whitespace-pre-wrap font-mono text-xs text-slate-100">{{ diffText() || 'Selecciona un archivo para ver el diff.' }}</pre>
            </div>
          </div>
          <details>
            <summary class="cursor-pointer text-sm font-medium">Commits exclusivos de origen ({{ comparison.commits.length }})</summary>
            <ul class="mt-2 space-y-1 text-sm">
              @for (commit of comparison.commits; track commit.hash) {
                <li class="font-mono text-xs"><span class="text-slate-500">{{ commit.hash.slice(0, 8) }}</span> {{ commit.subject }} <span class="text-slate-500">· {{ commit.author }}</span></li>
              }
            </ul>
          </details>
        </section>
      }

      <section class="card space-y-4 p-5" aria-labelledby="mdi-fields-title">
        <h2 id="mdi-fields-title" class="font-semibold">4. Datos del pase</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          @for (field of textFields; track field.key) {
            <label class="label" [for]="'mdi-' + field.key">{{ field.label }}
              <input class="input mt-1" [id]="'mdi-' + field.key" [value]="fields()[field.key]" (input)="setField(field.key, $any($event.target).value)" />
            </label>
          }
          <label class="label sm:col-span-2" for="mdi-objetivo">Objetivo
            <textarea id="mdi-objetivo" class="input mt-1 min-h-24" [value]="fields().OBJETIVO" (input)="setField('OBJETIVO', $any($event.target).value)"></textarea>
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="saveConfig()">Guardar configuración</button>
          <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="loadHistory()">Ver historial</button>
        </div>
        @if (history().length) {
          <ul class="divide-y divide-slate-100 dark:divide-slate-800">
            @for (item of history(); track item.id) {
              <li class="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span class="min-w-0 flex-1 truncate">{{ item.proyecto }} · {{ item.source_branch }} → {{ item.target_branch }}</span>
                <span class="text-xs text-slate-500">{{ item.created_at | date: 'medium' }}</span>
                <button type="button" class="btn-icon" [attr.aria-label]="'Eliminar historial ' + item.file_name" title="Eliminar historial" (click)="deleteHistory(item)"><app-icon name="trash" iconClass="size-4" /></button>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class MdiPage {
  protected readonly mdi = inject(MdiService);
  private readonly notifications = inject(NotificationService);
  protected readonly apps = MDI_APPS;
  protected readonly textFields = [
    { key: 'PROYECTO', label: 'Código de proyecto' },
    { key: 'NOMBRE_PROYECTO', label: 'Nombre del proyecto' },
    { key: 'NOMBRE', label: 'Elaborado por' },
    { key: 'SERVIDORES_BACK', label: 'Servidores back' },
    { key: 'SERVIDORES_FRONT', label: 'Servidores front' },
    { key: 'MDU', label: 'MDU adjunto' },
  ] as const;
  protected readonly app = signal<string>(MDI_APPS[0].id);
  protected readonly repoName = signal('');
  protected readonly branches = signal<string[]>([]);
  protected readonly source = signal('');
  protected readonly target = signal('');
  protected readonly excludes = signal(MDI_DEFAULT_EXCLUDES.join(', '));
  protected readonly result = signal<MdiCompareResult | null>(null);
  protected readonly diffText = signal('');
  protected readonly templateConfigured = signal(false);
  protected readonly history = signal<MdiHistoryItem[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fields = signal<MdiFields>({
    PROYECTO: '', NOMBRE_PROYECTO: '', APP: MDI_APPS[0].id, NOMBRE: '',
    FECHA: new Date().toLocaleDateString('es-PE'), OBJETIVO: '', MODULO: '',
    SERVIDORES_BACK: '', SERVIDORES_FRONT: '', MDU: '',
  });
  protected readonly canGenerate = computed(() => !!this.result() && this.templateConfigured());

  constructor() { void this.loadConfig(); }

  protected async pickRepository(): Promise<void> {
    await this.run('Abriendo carpeta…', async () => {
      const name = await this.mdi.pickRepository();
      if (name) {
        this.repoName.set(name);
        await this.loadBranches();
      }
    });
  }

  protected async loadBranches(): Promise<void> {
    await this.run('Leyendo ramas…', async () => {
      const result = await this.mdi.branches();
      this.branches.set([...new Set([...result.local, ...result.remote])].sort());
      this.source.set(result.current ?? '');
      this.target.set(result.remote.find((branch) => branch === 'origin/main') ?? result.local.find((branch) => branch === 'main') ?? '');
    });
  }

  protected async compare(): Promise<void> {
    await this.run('Comparando ramas…', async () => {
      this.result.set(await this.mdi.compare(this.source(), this.target(), this.excludes().split(',').map((item) => item.trim()).filter(Boolean)));
      this.diffText.set('');
    });
  }

  protected async loadDiff(file: MdiChangedFile): Promise<void> {
    await this.run('Leyendo diff…', async () => {
      this.diffText.set(await this.mdi.fileDiff(this.source(), this.target(), file.path));
    });
  }

  protected async onTemplate(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.run('Guardando plantilla…', async () => {
      await this.mdi.saveTemplate(this.app(), file);
      this.templateConfigured.set(true);
      this.notifications.success('Plantilla guardada.');
    });
  }

  protected async generate(): Promise<void> {
    const result = this.result();
    if (!result) return;
    await this.run('Generando Word…', async () => {
      const fields = { ...this.fields(), APP: this.app() };
      const fileName = await this.mdi.generate(this.app(), fields, result);
      this.notifications.success(`Documento generado: ${fileName}`);
      await this.loadHistory();
    });
  }

  protected async saveConfig(): Promise<void> {
    await this.run('Guardando configuración…', async () => {
      const config: MdiConfig = {
        targetBranch: this.target(),
        excludes: this.excludes().split(',').map((item) => item.trim()).filter(Boolean),
        serversBack: this.fields().SERVIDORES_BACK,
        serversFront: this.fields().SERVIDORES_FRONT,
        author: this.fields().NOMBRE,
      };
      await this.mdi.saveConfig(this.app(), config);
      this.notifications.success('Configuración guardada.');
    });
  }

  protected async loadHistory(): Promise<void> {
    await this.run('Cargando historial…', async () => this.history.set(await this.mdi.history()));
  }

  protected async deleteHistory(item: MdiHistoryItem): Promise<void> {
    await this.run('Eliminando registro…', async () => {
      await this.mdi.deleteHistory(item.id);
      this.history.update((items) => items.filter((current) => current.id !== item.id));
    });
  }

  protected async selectApp(app: string): Promise<void> {
    this.app.set(app);
    this.fields.update((fields) => ({ ...fields, APP: app }));
    await this.loadConfig();
  }

  protected setField(key: keyof MdiFields, value: string): void {
    this.fields.update((fields) => ({ ...fields, [key]: value }));
  }

  protected statusLabel(status: MdiChangedFile['status']): string {
    return status === 'added' ? 'Nuevo' : status === 'deleted' ? 'Eliminado' : 'Modificado';
  }

  private async loadConfig(): Promise<void> {
    try {
      const [config, template] = await Promise.all([
        this.mdi.config(this.app()),
        this.mdi.hasTemplate(this.app()),
      ]);
      this.excludes.set(config.excludes.join(', '));
      this.templateConfigured.set(template);
      this.fields.update((fields) => ({ ...fields, APP: this.app(), NOMBRE: config.author, SERVIDORES_BACK: config.serversBack, SERVIDORES_FRONT: config.serversFront }));
    } catch (error) {
      this.error.set(toAppError(error).message);
    }
  }

  private async run(label: string, task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try { await task(); }
    catch (error) { this.error.set(toAppError(error).message); }
    finally { this.busy.set(false); void label; }
  }
}