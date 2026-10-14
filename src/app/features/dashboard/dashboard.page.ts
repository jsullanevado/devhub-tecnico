import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardService } from '../../core/data/dashboard.service';
import { FavoritesService } from '../../core/data/favorites.service';
import { RelationsService } from '../../core/data/relations.service';
import {
  DashboardRecentItem,
  RESOURCE_TYPE_LABELS,
  STORAGE_DANGER_PERCENT,
  STORAGE_QUOTA_BYTES,
  STORAGE_WARN_PERCENT,
  storageUsagePercent,
} from '../../core/models';
import { RESOURCE_PATHS } from '../../core/routing/app-paths';
import { LayoutService } from '../../layout/layout.service';
import { buildObjectRows, buildTraceRows } from '../../shared/relations/relations';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { Alert } from '../../shared/ui/alert/alert';
import { VisibilityBadge } from '../../shared/ui/badges/badges';
import { Icon, IconName } from '../../shared/ui/icon/icon';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { formatBytes } from '../../shared/utils/format';
import { RESOURCE_TYPE_ICONS } from '../../shared/resources/resource-type-icons';

const FAVORITES_PREVIEW = 6;

interface QuickAction {
  label: string;
  path: string;
  icon: IconName;
}

interface Stat {
  label: string;
  value: number;
  icon: IconName;
  path: string;
  query?: Record<string, string>;
  /** Para crear el primero cuando no hay ninguno. */
  createPath?: string;
}

interface Pending {
  count: number;
  label: string;
  hint: string;
  path: string;
  query?: Record<string, string>;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Servicio o DataPower', path: '/services/new', icon: 'plug' },
  { label: 'Conexión de BD', path: '/databases/new', icon: 'database' },
  { label: 'Script', path: '/scripts/new', icon: 'code' },
  { label: 'Carga masiva', path: '/bulk-import', icon: 'upload' },
  { label: 'Generar MDI', path: '/mdi', icon: 'file-code' },
];

function greetingFor(hour: number): string {
  return hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
}

@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, DecimalPipe, RouterLink, Alert, Icon, Spinner, VisibilityBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 class="text-2xl font-semibold">{{ greeting }}{{ name() ? ', ' + name() : '' }}</h1>
        <p class="mt-1 text-slate-600 dark:text-slate-400">
          Base de conocimiento técnico de tu equipo. Pulsa <kbd class="kbd">Ctrl K</kbd> o
          <kbd class="kbd">/</kbd> para buscar.
        </p>
      </header>

      <nav aria-label="Accesos rápidos" class="flex flex-wrap gap-2">
        @for (action of quickActions; track action.path) {
          <a
            [routerLink]="action.path"
            class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10"
          >
            <app-icon
              [name]="action.icon"
              iconClass="size-4 text-indigo-600 dark:text-indigo-400"
            />
            @if (action.path.endsWith('/new')) {
              <span class="text-slate-400">+</span>
            }
            {{ action.label }}
          </a>
        }
      </nav>

      @if (summaryState().status === 'error') {
        <app-alert type="warning">
          No se pudo cargar el resumen: {{ summaryState().error }}
          <button type="button" class="ms-2 font-medium underline" (click)="summary.reload()">
            Reintentar
          </button>
        </app-alert>
      }

      @if (lessons(); as lessons) {
        @if (lessons.open > 0) {
          <a
            routerLink="/lessons"
            [queryParams]="{ status: 'open' }"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm transition focus-visible:outline-2 focus-visible:outline-indigo-600"
            [class]="
              lessons.open_critical > 0
                ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
                : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            "
          >
            <app-icon name="alert" iconClass="size-5" />
            <span class="font-medium">
              {{ lessons.open }}
              {{ lessons.open === 1 ? 'lección abierta' : 'lecciones abiertas' }}
            </span>
            @if (lessons.open_critical > 0) {
              <span class="badge">{{ lessons.open_critical }} crítica(s)</span>
            }
            @if (lessons.open_high > 0) {
              <span class="badge">{{ lessons.open_high }} alta(s)</span>
            }
            <span class="ms-auto inline-flex items-center gap-1">
              Revisar <app-icon name="chevron-right" iconClass="size-4" />
            </span>
          </a>
        }
      }

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" class="sr-only">Resumen</h2>
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" data-testid="stats">
          @for (stat of stats(); track stat.label) {
            <li>
              @if (stat.value === 0 && stat.createPath) {
                <a
                  [routerLink]="stat.createPath"
                  class="flex h-full flex-col rounded-lg border border-dashed border-slate-300 p-3 text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:text-indigo-400"
                >
                  <span class="flex items-center gap-1.5 text-xs">
                    <app-icon [name]="stat.icon" iconClass="size-3.5" /> {{ stat.label }}
                  </span>
                  <span class="mt-1 text-sm font-medium">+ Crear el primero</span>
                </a>
              } @else {
                <a
                  [routerLink]="stat.path"
                  [queryParams]="stat.query"
                  class="card flex h-full flex-col p-3 transition hover:border-indigo-300 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:border-indigo-700"
                >
                  <span
                    class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <app-icon [name]="stat.icon" iconClass="size-3.5" /> {{ stat.label }}
                  </span>
                  <span class="mt-1 text-2xl font-semibold tabular-nums">{{ stat.value }}</span>
                </a>
              }
            </li>
          }
        </ul>
      </section>

      <div class="grid gap-6 lg:grid-cols-3">
        <section class="card p-5 lg:col-span-2" aria-labelledby="recent-title">
          <h2 id="recent-title" class="font-semibold">Agregados recientemente</h2>
          @if (summaryState().status === 'loading') {
            <div class="flex justify-center py-10"><app-spinner /></div>
          } @else if (recent().length === 0) {
            <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Todavía no hay contenido. Crea el primero con el botón <strong>Nuevo</strong> de la
              barra superior.
            </p>
          } @else {
            <ul class="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              @for (item of recent(); track item.resource_type + item.id) {
                <li>
                  <a
                    [routerLink]="link(item)"
                    class="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-slate-800/50"
                  >
                    <app-icon
                      [name]="typeIcon[item.resource_type]"
                      iconClass="size-5 text-slate-400"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">{{ item.title }}</p>
                      <p class="truncate text-xs text-slate-500 dark:text-slate-400">
                        {{ typeLabel[item.resource_type] }} · {{ item.author || 'Usuario' }} ·
                        {{ item.updated_at | date: 'mediumDate' }}
                      </p>
                    </div>
                    @if (item.visibility === 'private') {
                      <app-visibility-badge [visibility]="item.visibility" />
                    }
                  </a>
                </li>
              }
            </ul>
          }
        </section>

        <div class="space-y-6">
          <section class="card p-5" aria-labelledby="pending-title">
            <h2 id="pending-title" class="font-semibold">Pendientes de documentar</h2>
            @if (graphState().status === 'loading') {
              <div class="flex justify-center py-6"><app-spinner /></div>
            } @else if (pending().length === 0) {
              <p
                class="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"
              >
                <app-icon name="check" iconClass="size-4" />
                {{
                  hasRelationsData()
                    ? 'Todo lo visible está relacionado.'
                    : 'Cuando registres servicios y SP verás aquí lo que falta relacionar.'
                }}
              </p>
            } @else {
              <ul class="mt-2 space-y-1" data-testid="pending">
                @for (item of pending(); track item.label) {
                  <li>
                    <a
                      [routerLink]="item.path"
                      [queryParams]="item.query"
                      class="-mx-2 flex items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-slate-800/50"
                    >
                      <span
                        class="mt-0.5 min-w-7 rounded-md bg-amber-100 px-1.5 text-center text-sm font-semibold text-amber-800 tabular-nums dark:bg-amber-500/15 dark:text-amber-300"
                        >{{ item.count }}</span
                      >
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm">{{ item.label }}</span>
                        <span class="block text-xs text-slate-500 dark:text-slate-400">{{
                          item.hint
                        }}</span>
                      </span>
                      <app-icon name="chevron-right" iconClass="mt-1 size-4 text-slate-400" />
                    </a>
                  </li>
                }
              </ul>
            }
          </section>

          <section class="card p-5" aria-labelledby="mine-title">
            <h2 id="mine-title" class="font-semibold">Continuar donde lo dejaste</h2>
            @if (summaryState().status === 'loading') {
              <div class="flex justify-center py-6"><app-spinner /></div>
            } @else if (mineRecent().length === 0) {
              <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Aquí aparecerá lo último que crees o edites.
              </p>
            } @else {
              <ul class="mt-2 space-y-1">
                @for (item of mineRecent(); track item.resource_type + item.id) {
                  <li>
                    <a
                      [routerLink]="link(item)"
                      class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-slate-800/50"
                    >
                      <app-icon
                        [name]="typeIcon[item.resource_type]"
                        iconClass="size-4 text-slate-400"
                      />
                      <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
                      <time
                        class="shrink-0 text-xs text-slate-500 dark:text-slate-400"
                        [attr.datetime]="item.updated_at"
                        >{{ item.updated_at | date: 'd MMM' }}</time
                      >
                    </a>
                  </li>
                }
              </ul>
            }
          </section>

          <section class="card p-5" aria-labelledby="favorites-title">
            <div class="flex items-center justify-between gap-2">
              <h2 id="favorites-title" class="font-semibold">Tus favoritos</h2>
              <a
                routerLink="/favorites"
                class="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                >Ver todos</a
              >
            </div>
            @if (favoritesState().status === 'loading') {
              <div class="flex justify-center py-6"><app-spinner /></div>
            } @else if (favorites().length === 0) {
              <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Marca con la estrella ☆ lo que consultas a menudo.
              </p>
            } @else {
              <ul class="mt-2 space-y-1">
                @for (favorite of favorites(); track favorite.id) {
                  <li>
                    <a
                      [routerLink]="paths[favorite.type] + '/' + favorite.resourceId"
                      class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-slate-800/50"
                    >
                      <app-icon name="star" iconClass="size-4 text-amber-500" />
                      <span class="min-w-0 flex-1 truncate">{{ favorite.title }}</span>
                    </a>
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <section class="card p-5" aria-labelledby="downloads-title">
          <h2 id="downloads-title" class="font-semibold">Manuales más descargados</h2>
          @if (topManuals().length === 0) {
            <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Aún no hay descargas registradas.
            </p>
          } @else {
            <ol class="mt-2 space-y-1">
              @for (manual of topManuals(); track manual.id) {
                <li>
                  <a
                    [routerLink]="paths.manual + '/' + manual.id"
                    class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-slate-800/50"
                  >
                    <app-icon name="download" iconClass="size-4 text-slate-400" />
                    <span class="min-w-0 flex-1 truncate">{{ manual.title }}</span>
                    <span class="badge tabular-nums">{{ manual.download_count }}</span>
                  </a>
                </li>
              }
            </ol>
          }
        </section>

        <section class="card p-5" aria-labelledby="tags-title">
          <h2 id="tags-title" class="font-semibold">Etiquetas más usadas</h2>
          @if (topTags().length === 0) {
            <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Las etiquetas que uses aparecerán aquí.
            </p>
          } @else {
            <ul class="mt-3 flex flex-wrap gap-2">
              @for (item of topTags(); track item.tag) {
                <li>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-500/10"
                    [attr.aria-label]="'Buscar la etiqueta ' + item.tag"
                    (click)="layout.openSearch(item.tag)"
                  >
                    <app-icon name="tag" iconClass="size-3.5 text-slate-400" />
                    {{ item.tag }}
                    <span class="text-slate-500 tabular-nums dark:text-slate-400">{{
                      item.count
                    }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        </section>

        <section class="card p-5" aria-labelledby="storage-title">
          <h2 id="storage-title" class="font-semibold">Almacenamiento de manuales</h2>
          @if (storage(); as storage) {
            <p class="mt-3 text-sm">
              <strong class="font-semibold">{{ storage.used }}</strong>
              de {{ storage.quota }} ({{ storage.percent | number: '1.0-1' }} %)
            </p>
            <div
              class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
              role="progressbar"
              aria-labelledby="storage-title"
              aria-valuemin="0"
              aria-valuemax="100"
              [attr.aria-valuenow]="storage.percent"
            >
              <div
                class="h-full rounded-full"
                [class]="storage.barClass"
                [style.width.%]="storage.percent"
              ></div>
            </div>
            <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Cuota del plan gratuito de Supabase, compartida por todo el equipo. Comprime los PDF y
              las imágenes de los Word antes de subirlos.
            </p>
          } @else if (summaryState().status === 'loading') {
            <div class="flex justify-center py-6"><app-spinner /></div>
          }
        </section>
      </div>
    </div>
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly relations = inject(RelationsService);
  protected readonly layout = inject(LayoutService);

  protected readonly typeIcon = RESOURCE_TYPE_ICONS;
  protected readonly typeLabel = RESOURCE_TYPE_LABELS;
  protected readonly paths = RESOURCE_PATHS;
  protected readonly quickActions = QUICK_ACTIONS;
  protected readonly greeting = greetingFor(new Date().getHours());

  protected readonly summary = createAsyncLoader(
    () => true,
    () => this.dashboardService.summary(),
  );
  private readonly favoritesLoader = createAsyncLoader(
    () => true,
    () => this.favoritesService.list(),
  );

  private readonly graph = createAsyncLoader(
    () => true,
    () => this.relations.graph(),
  );

  protected readonly summaryState = this.summary.state;
  protected readonly favoritesState = this.favoritesLoader.state;
  protected readonly graphState = this.graph.state;

  protected readonly name = computed(() => {
    const profile = this.auth.profile();
    return profile?.full_name?.split(' ')[0] || profile?.username || '';
  });

  protected readonly stats = computed<Stat[]>(() => {
    const counts = this.summary.value()?.counts;
    const graph = this.graph.value();
    const services = graph?.services ?? [];
    const objects = (graph?.databases ?? []).flatMap((database) => database.objects);
    const total = (type: 'script' | 'lesson' | 'note' | 'manual' | 'database') =>
      counts?.[type]?.total ?? 0;
    const list: Stat[] = [
      {
        label: 'Servicios',
        value: services.filter((service) => service.kind === 'service').length,
        icon: 'plug',
        path: '/services',
        query: { kind: 'service' },
        createPath: '/services/new',
      },
      {
        label: 'DataPower',
        value: services.filter((service) => service.kind === 'datapower').length,
        icon: 'shield',
        path: '/services',
        query: { kind: 'datapower' },
        createPath: '/services/new',
      },
      {
        label: 'Conexiones',
        value: total('database'),
        icon: 'database',
        path: '/databases',
        createPath: '/databases/new',
      },
      {
        label: 'SP y objetos',
        value: objects.length + objects.reduce((sum, object) => sum + object.members.length, 0),
        icon: 'chart',
        path: '/reports',
        query: { view: 'objects' },
      },
      { label: 'Scripts', value: total('script'), icon: 'code', path: '/scripts', createPath: '/scripts/new' },
      { label: 'Manuales', value: total('manual'), icon: 'book', path: '/manuals', createPath: '/manuals/new' },
      { label: 'Lecciones', value: total('lesson'), icon: 'lightbulb', path: '/lessons', createPath: '/lessons/new' },
      { label: 'Notas', value: total('note'), icon: 'note', path: '/notes', createPath: '/notes/new' },
    ];
    return list;
  });

  /** Lo visible para el usuario que falta relacionar, con enlace al reporte ya filtrado. */
  protected readonly pending = computed<Pending[]>(() => {
    const graph = this.graph.value();
    if (!graph) {
      return [];
    }
    const trace = buildTraceRows(graph);
    const objects = buildObjectRows(graph);
    const items: Pending[] = [
      {
        count: trace.filter((row) => row.kind === 'DataPower' && !row.route).length,
        label: 'operaciones de DataPower sin servicio destino',
        hint: 'Indica a qué servicio enruta cada una.',
        path: '/reports',
        query: { kind: 'DataPower', status: 'orphan' },
      },
      {
        count: trace.filter((row) => row.kind !== 'DataPower' && !row.object).length,
        label: 'operaciones de servicios que no llegan a ninguna BD',
        hint: 'Relaciona los SP o tablas que usan.',
        path: '/reports',
        query: { status: 'no-db' },
      },
      {
        count: objects.filter((row) => row.member && row.usedBy.length === 0).length,
        label: 'SP / funciones sin uso registrado',
        hint: 'Ningún servicio indica que los use.',
        path: '/reports',
        query: { view: 'objects', usage: 'unused' },
      },
      {
        count: graph.services.filter((service) => service.operations.length === 0).length,
        label: 'servicios sin operaciones',
        hint: 'Completa sus operaciones.',
        path: '/services',
      },
    ];
    return items.filter((item) => item.count > 0);
  });

  protected readonly hasRelationsData = computed(() => {
    const graph = this.graph.value();
    return !!graph && (graph.services.length > 0 || graph.databases.length > 0);
  });

  protected readonly lessons = computed(() => this.summary.value()?.lessons ?? null);
  protected readonly recent = computed(() => this.summary.value()?.recent ?? []);
  protected readonly mineRecent = computed(() => this.summary.value()?.mine_recent ?? []);
  protected readonly topManuals = computed(() => this.summary.value()?.top_manuals ?? []);
  protected readonly topTags = computed(() => this.summary.value()?.top_tags ?? []);

  protected readonly favorites = computed(() =>
    (this.favoritesLoader.value() ?? [])
      .filter((item) => item.resource)
      .slice(0, FAVORITES_PREVIEW)
      .map((item) => ({
        id: item.id,
        type: item.resource_type,
        resourceId: item.resource_id,
        title: item.resource?.title ?? '',
      })),
  );

  protected readonly storage = computed(() => {
    const used = this.summary.value()?.storage.used_bytes;
    if (used === undefined) {
      return null;
    }
    const percent = storageUsagePercent(used);
    return {
      used: formatBytes(used),
      quota: formatBytes(STORAGE_QUOTA_BYTES),
      percent,
      barClass:
        percent >= STORAGE_DANGER_PERCENT
          ? 'bg-red-500'
          : percent >= STORAGE_WARN_PERCENT
            ? 'bg-amber-500'
            : 'bg-indigo-600',
    };
  });

  protected link(item: DashboardRecentItem): string {
    return `${RESOURCE_PATHS[item.resource_type]}/${item.id}`;
  }
}
