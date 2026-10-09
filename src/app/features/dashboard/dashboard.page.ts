import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardService } from '../../core/data/dashboard.service';
import { FavoritesService } from '../../core/data/favorites.service';
import {
  DashboardRecentItem,
  RESOURCE_TYPE_LABELS,
  ResourceType,
  STORAGE_DANGER_PERCENT,
  STORAGE_QUOTA_BYTES,
  STORAGE_WARN_PERCENT,
  storageUsagePercent,
} from '../../core/models';
import { APP_PATHS, RESOURCE_PATHS } from '../../core/routing/app-paths';
import { LayoutService } from '../../layout/layout.service';
import { visibleSections } from '../../layout/navigation';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { Alert } from '../../shared/ui/alert/alert';
import { VisibilityBadge } from '../../shared/ui/badges/badges';
import { Icon, IconName } from '../../shared/ui/icon/icon';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { formatBytes } from '../../shared/utils/format';

const TYPE_ICON: Record<ResourceType, IconName> = {
  script: 'code',
  lesson: 'lightbulb',
  note: 'note',
  manual: 'book',
};

const PATH_TYPE = Object.fromEntries(
  Object.entries(RESOURCE_PATHS).map(([type, path]) => [path, type]),
) as Record<string, ResourceType>;

const FAVORITES_PREVIEW = 5;

@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, DecimalPipe, RouterLink, Alert, Icon, Spinner, VisibilityBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 class="text-2xl font-semibold">Hola{{ name() ? ', ' + name() : '' }}</h1>
        <p class="mt-1 text-slate-600 dark:text-slate-400">
          Base de conocimiento técnico de tu equipo. Pulsa <kbd class="kbd">Ctrl K</kbd> o
          <kbd class="kbd">/</kbd> para buscar.
        </p>
      </header>

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

      <section aria-labelledby="modules-title">
        <h2 id="modules-title" class="sr-only">Módulos</h2>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (item of modules(); track item.path) {
            <li>
              <a
                [routerLink]="item.path"
                class="card flex h-full gap-4 p-5 transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:border-indigo-700"
              >
                <app-icon
                  [name]="item.icon"
                  iconClass="mt-0.5 size-6 text-indigo-600 dark:text-indigo-400"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline justify-between gap-2">
                    <h3 class="font-medium">{{ item.label }}</h3>
                    @if (item.count !== null) {
                      <span class="text-2xl font-semibold tabular-nums">{{ item.count }}</span>
                    }
                  </div>
                  <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {{ item.description }}
                  </p>
                  @if (item.mine !== null) {
                    <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {{ item.mine }} {{ item.mine === 1 ? 'tuyo' : 'tuyos' }}
                    </p>
                  }
                </div>
              </a>
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
  protected readonly layout = inject(LayoutService);

  protected readonly typeIcon = TYPE_ICON;
  protected readonly typeLabel = RESOURCE_TYPE_LABELS;
  protected readonly paths = RESOURCE_PATHS;

  protected readonly summary = createAsyncLoader(
    () => true,
    () => this.dashboardService.summary(),
  );
  private readonly favoritesLoader = createAsyncLoader(
    () => true,
    () => this.favoritesService.list(),
  );

  protected readonly summaryState = this.summary.state;
  protected readonly favoritesState = this.favoritesLoader.state;

  protected readonly name = computed(() => {
    const profile = this.auth.profile();
    return profile?.full_name?.split(' ')[0] || profile?.username || '';
  });

  protected readonly modules = computed(() => {
    const counts = this.summary.value()?.counts;
    const favoritesCount = this.favoritesLoader.value()?.filter((item) => item.resource).length;
    return visibleSections(this.auth.isAdmin())
      .flatMap((section) => section.items)
      .filter((item) => item.path !== APP_PATHS.home)
      .map((item) => {
        const type = PATH_TYPE[item.path];
        if (type) {
          const count = counts?.[type];
          return {
            ...item,
            count: counts ? (count?.total ?? 0) : null,
            mine: counts ? (count?.mine ?? 0) : null,
          };
        }
        const isFavorites = item.path === '/favorites';
        return { ...item, count: isFavorites ? (favoritesCount ?? null) : null, mine: null };
      });
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
