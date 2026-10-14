import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/data/favorites.service';
import { toAppError } from '../../core/errors/error-mapper';
import { FavoriteItem, RESOURCE_TYPE_LABELS, ResourceType } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { RESOURCE_PATHS } from '../../core/routing/app-paths';
import { FavoritesState } from '../../shared/favorites/favorites.state';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { VisibilityBadge } from '../../shared/ui/badges/badges';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { RESOURCE_TYPE_ICONS } from '../../shared/resources/resource-type-icons';

type TypeFilter = ResourceType | 'all';

const FILTERS: readonly { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'script', label: 'Scripts' },
  { value: 'lesson', label: 'Lecciones' },
  { value: 'note', label: 'Notas' },
  { value: 'manual', label: 'Manuales' },
  { value: 'service', label: 'Servicios' },
  { value: 'database', label: 'Bases de datos' },
];

@Component({
  selector: 'app-favorites-page',
  imports: [RouterLink, DatePipe, PageHeader, LoadState, EmptyState, VisibilityBadge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl space-y-6">
      <app-page-header
        title="Favoritos"
        description="Recursos que marcaste con la estrella para tenerlos a mano."
      />

      <app-load-state [state]="loader.state()" backLink="/dashboard" backLabel="Volver al inicio">
        <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
          @for (option of filters; track option.value) {
            <button
              type="button"
              class="rounded-full border px-3 py-1 text-sm transition aria-pressed:border-indigo-600 aria-pressed:bg-indigo-600 aria-pressed:text-white border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              [attr.aria-pressed]="filter() === option.value"
              (click)="filter.set(option.value)"
            >
              {{ option.label }} ({{ counts()[option.value] }})
            </button>
          }
        </div>

        @if (visible().length === 0) {
          <app-empty-state
            class="mt-6 block"
            icon="star"
            [title]="items().length ? 'No hay favoritos de este tipo' : 'Aún no tienes favoritos'"
            message="Pulsa la estrella en cualquier script, lección, nota, manual, servicio o base de datos para guardarlo aquí."
          />
        } @else {
          <ul class="mt-6 space-y-3">
            @for (item of visible(); track item.id) {
              <li class="card flex items-start gap-4 p-4">
                <app-icon
                  [name]="typeIcon[item.resource_type]"
                  iconClass="mt-0.5 size-5 text-indigo-600 dark:text-indigo-400"
                />
                <div class="min-w-0 flex-1">
                  @if (item.resource; as resource) {
                    <a [routerLink]="link(item)" class="link font-medium">{{ resource.title }}</a>
                    @if (resource.description) {
                      <p class="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                        {{ resource.description }}
                      </p>
                    }
                  } @else {
                    <p class="font-medium text-slate-500 dark:text-slate-400">
                      Recurso no disponible
                    </p>
                    <p class="text-sm text-slate-500 dark:text-slate-400">
                      Su propietario lo hizo privado. Puedes quitarlo de tus favoritos.
                    </p>
                  }
                  <div
                    class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <span class="badge">{{ typeLabel[item.resource_type] }}</span>
                    @if (item.resource; as resource) {
                      <app-visibility-badge [visibility]="resource.visibility" />
                    }
                    <span>Añadido el {{ item.created_at | date: 'mediumDate' }}</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn-icon"
                  [disabled]="removing().has(item.id)"
                  [attr.aria-label]="
                    'Quitar ' + (item.resource?.title ?? 'recurso') + ' de favoritos'
                  "
                  title="Quitar de favoritos"
                  (click)="remove(item)"
                >
                  <app-icon name="star" iconClass="size-5 fill-amber-400 text-amber-500" />
                </button>
              </li>
            }
          </ul>
        }
      </app-load-state>
    </div>
  `,
})
export class FavoritesPage {
  private readonly service = inject(FavoritesService);
  private readonly favorites = inject(FavoritesState);
  private readonly notifications = inject(NotificationService);

  protected readonly filters = FILTERS;
  protected readonly typeIcon = RESOURCE_TYPE_ICONS;
  protected readonly typeLabel = RESOURCE_TYPE_LABELS;
  protected readonly filter = signal<TypeFilter>('all');
  protected readonly removing = signal<ReadonlySet<string>>(new Set());
  private readonly removed = signal<ReadonlySet<string>>(new Set());

  protected readonly loader = createAsyncLoader(
    () => true,
    () => this.service.list(),
  );
  protected readonly items = computed(() =>
    (this.loader.value() ?? []).filter((item) => !this.removed().has(item.id)),
  );
  protected readonly visible = computed(() =>
    this.filter() === 'all'
      ? this.items()
      : this.items().filter((item) => item.resource_type === this.filter()),
  );
  protected readonly counts = computed(() => {
    const counts: Record<TypeFilter, number> = {
      all: 0,
      script: 0,
      lesson: 0,
      note: 0,
      manual: 0,
      service: 0,
      database: 0,
    };
    for (const item of this.items()) {
      counts.all++;
      counts[item.resource_type]++;
    }
    return counts;
  });

  protected link(item: FavoriteItem): string[] {
    return [RESOURCE_PATHS[item.resource_type], item.resource_id];
  }

  protected async remove(item: FavoriteItem): Promise<void> {
    this.removing.update((current) => new Set(current).add(item.id));
    try {
      await this.favorites.remove(item.resource_type, item.resource_id);
      this.removed.update((current) => new Set(current).add(item.id));
      this.notifications.info('Quitado de favoritos.');
    } catch (error) {
      this.notifications.error(toAppError(error).message);
    } finally {
      this.removing.update((current) => {
        const copy = new Set(current);
        copy.delete(item.id);
        return copy;
      });
    }
  }
}
