import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatabasesService } from '../../core/data/databases.service';
import {
  DATABASE_ENGINES,
  DATABASE_ENVIRONMENTS,
  DatabaseFilters,
  DatabaseSummary,
  databaseEngineLabel,
  databaseEnvironmentLabel,
} from '../../core/models';
import { oneOf } from '../../shared/resources/list-query';
import { ListToolbar } from '../../shared/resources/list-toolbar';
import { ListView } from '../../shared/resources/list-view';
import { ResourceCard } from '../../shared/resources/resource-card';
import { ResourceListStore } from '../../shared/resources/resource-list.store';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import {
  DATABASE_ENGINE_VALUES,
  DATABASE_ENVIRONMENT_VALUES,
  DATABASE_FILTER_CODEC,
  connectionTarget,
  environmentBadgeClass,
} from './databases.codec';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-databases-list-page',
  imports: [RouterLink, PageHeader, ListToolbar, ListView, ResourceCard, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let query = list.query();
    <div class="mx-auto max-w-6xl space-y-6">
      <app-page-header
        title="Bases de datos"
        description="Cadenas de conexión (TNS, JDBC), host, servicio, usuario y contraseña de cada base."
      >
        <a routerLink="new" class="btn btn-primary">
          <app-icon name="plus" iconClass="size-4" /> Nueva conexión
        </a>
      </app-page-header>

      <app-list-toolbar
        viewKey="databases"
        subject="conexiones"
        [search]="query.search"
        [tags]="query.tags"
        [scope]="query.scope"
        [sort]="query.sort"
        [hasFilters]="list.hasActiveFilters()"
        (searchChange)="list.update({ search: $event })"
        (tagsChange)="list.update({ tags: $event })"
        (scopeChange)="list.update({ scope: $event })"
        (sortChange)="list.update({ sort: $event })"
        (clear)="list.clearFilters()"
      >
        <select class="input w-auto" aria-label="Motor" (change)="onEngine($event)">
          <option value="">Todos los motores</option>
          @for (option of engines; track option.value) {
            <option [value]="option.value" [selected]="option.value === query.filters.engine">
              {{ option.label }}
            </option>
          }
        </select>
        <select class="input w-auto" aria-label="Entorno" (change)="onEnvironment($event)">
          <option value="">Todos los entornos</option>
          @for (option of environments; track option.value) {
            <option [value]="option.value" [selected]="option.value === query.filters.environment">
              {{ option.label }}
            </option>
          }
        </select>
      </app-list-toolbar>

      <app-list-view
        viewKey="databases"
        [loading]="list.loading()"
        [error]="list.error()"
        [total]="list.page()?.total ?? null"
        [page]="query.page"
        [pageSize]="pageSize"
        [hasFilters]="list.hasActiveFilters()"
        emptyTitle="Todavía no hay conexiones"
        emptyMessage="Registra una base de datos pegando su entrada de tnsnames.ora o su URL JDBC."
        (retry)="list.reload()"
        (clearFilters)="list.clearFilters()"
        (pageChange)="list.update({ page: $event })"
      >
        <a empty-action routerLink="new" class="btn btn-primary">Nueva conexión</a>
        <ul
          class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 group-data-[layout=list]/list:grid-cols-1 group-data-[layout=list]/list:gap-2"
        >
          @for (database of items(); track database.id) {
            <li>
              <app-resource-card
                favoriteType="database"
                [resource]="database"
                [link]="['/databases', database.id]"
              >
                <span class="badge">{{ engineLabel(database.engine) }}</span>
                <span class="badge" [class]="environmentClass(database.environment)">{{
                  environmentLabel(database.environment)
                }}</span>
                @if (target(database); as target) {
                  <span
                    class="w-full truncate font-mono text-xs text-slate-500 dark:text-slate-400"
                  >
                    {{ target }}
                  </span>
                }
              </app-resource-card>
            </li>
          }
        </ul>
      </app-list-view>
    </div>
  `,
})
export class DatabasesListPage {
  protected readonly list = new ResourceListStore<DatabaseSummary, DatabaseFilters>(
    inject(DatabasesService),
    DATABASE_FILTER_CODEC,
    PAGE_SIZE,
  );
  protected readonly items = computed(() => this.list.page()?.items ?? []);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly engines = DATABASE_ENGINES;
  protected readonly environments = DATABASE_ENVIRONMENTS;
  protected readonly engineLabel = databaseEngineLabel;
  protected readonly environmentLabel = databaseEnvironmentLabel;
  protected readonly environmentClass = environmentBadgeClass;
  protected readonly target = connectionTarget;

  protected onEngine(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.list.update({ filters: { engine: oneOf(value, DATABASE_ENGINE_VALUES) } });
  }

  protected onEnvironment(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.list.update({ filters: { environment: oneOf(value, DATABASE_ENVIRONMENT_VALUES) } });
  }
}
