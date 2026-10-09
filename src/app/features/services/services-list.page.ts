import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServicesService } from '../../core/data/services.service';
import {
  SERVICE_PROTOCOLS,
  ServiceFilters,
  ServiceSummary,
  serviceProtocolLabel,
} from '../../core/models';
import { oneOf } from '../../shared/resources/list-query';
import { ListToolbar } from '../../shared/resources/list-toolbar';
import { ListView } from '../../shared/resources/list-view';
import { ResourceCard } from '../../shared/resources/resource-card';
import { ResourceListStore } from '../../shared/resources/resource-list.store';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { SearchBox } from '../../shared/ui/search-box/search-box';
import { SERVICE_FILTER_CODEC, SERVICE_PROTOCOL_VALUES } from './services.codec';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-services-list-page',
  imports: [RouterLink, PageHeader, ListToolbar, ListView, ResourceCard, SearchBox, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let query = list.query();
    <div class="mx-auto max-w-6xl space-y-6">
      <app-page-header
        title="Servicios"
        description="Endpoints REST/SOAP y DataPower: headers, request, response y credenciales de cada operación."
      >
        <a routerLink="new" class="btn btn-primary">
          <app-icon name="plus" iconClass="size-4" /> Nuevo servicio
        </a>
      </app-page-header>

      <app-list-toolbar
        subject="servicios"
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
        <select class="input w-auto" aria-label="Protocolo" (change)="onProtocol($event)">
          <option value="">REST y SOAP</option>
          @for (option of protocols; track option.value) {
            <option [value]="option.value" [selected]="option.value === query.filters.protocol">
              {{ option.label }}
            </option>
          }
        </select>
        <app-search-box
          class="w-44"
          [value]="query.filters.system ?? ''"
          placeholder="Sistema"
          label="Filtrar por sistema exacto"
          (valueChange)="list.update({ filters: { system: $event || undefined } })"
        />
      </app-list-toolbar>

      <app-list-view
        [loading]="list.loading()"
        [error]="list.error()"
        [total]="list.page()?.total ?? null"
        [page]="query.page"
        [pageSize]="pageSize"
        [hasFilters]="list.hasActiveFilters()"
        emptyTitle="Todavía no hay servicios"
        emptyMessage="Documenta un endpoint con sus operaciones, headers y ejemplos de request/response."
        (retry)="list.reload()"
        (clearFilters)="list.clearFilters()"
        (pageChange)="list.update({ page: $event })"
      >
        <a empty-action routerLink="new" class="btn btn-primary">Nuevo servicio</a>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (service of items(); track service.id) {
            <li>
              <app-resource-card
                favoriteType="service"
                [resource]="service"
                [link]="['/services', service.id]"
              >
                <span
                  class="badge"
                  [class]="
                    service.protocol === 'soap'
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300'
                  "
                  >{{ protocolLabel(service.protocol) }}</span
                >
                @if (service.system) {
                  <span class="badge">{{ service.system }}</span>
                }
                @if (service.datapower_domain) {
                  <span class="badge">DataPower</span>
                }
                <span class="w-full truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                  {{ service.base_url }}
                </span>
              </app-resource-card>
            </li>
          }
        </ul>
      </app-list-view>
    </div>
  `,
})
export class ServicesListPage {
  protected readonly list = new ResourceListStore<ServiceSummary, ServiceFilters>(
    inject(ServicesService),
    SERVICE_FILTER_CODEC,
    PAGE_SIZE,
  );
  protected readonly items = computed(() => this.list.page()?.items ?? []);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly protocols = SERVICE_PROTOCOLS;
  protected readonly protocolLabel = serviceProtocolLabel;

  protected onProtocol(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.list.update({ filters: { protocol: oneOf(value, SERVICE_PROTOCOL_VALUES) } });
  }
}
