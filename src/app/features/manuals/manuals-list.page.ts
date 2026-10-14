import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ManualsService } from '../../core/data/manuals.service';
import { Manual, MANUAL_CATEGORIES, manualFileLabel, ManualFilters } from '../../core/models';
import { oneOf } from '../../shared/resources/list-query';
import { ListToolbar } from '../../shared/resources/list-toolbar';
import { ListView } from '../../shared/resources/list-view';
import { ResourceCard } from '../../shared/resources/resource-card';
import { ResourceListStore } from '../../shared/resources/resource-list.store';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { formatBytes } from '../../shared/utils/format';
import { MANUAL_CATEGORY_VALUES, MANUAL_FILTER_CODEC, manualCategoryLabel } from './manuals.codec';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-manuals-list-page',
  imports: [RouterLink, PageHeader, ListToolbar, ListView, ResourceCard, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let query = list.query();
    <div class="mx-auto max-w-6xl space-y-6">
      <app-page-header
        title="Manuales y arquitecturas"
        description="Documentos, manuales y referencias de arquitectura del equipo."
      >
        <a routerLink="new" class="btn btn-primary">
          <app-icon name="upload" iconClass="size-4" /> Subir documento
        </a>
      </app-page-header>

      <app-list-toolbar
        viewKey="manuals"
        subject="manuales"
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
        <select class="input w-auto" aria-label="Categoría" (change)="onCategory($event)">
          <option value="">Todas las categorías</option>
          @for (option of categories; track option.value) {
            <option [value]="option.value" [selected]="option.value === query.filters.category">
              {{ option.label }}
            </option>
          }
        </select>
      </app-list-toolbar>

      <app-list-view
        viewKey="manuals"
        [loading]="list.loading()"
        [error]="list.error()"
        [total]="list.page()?.total ?? null"
        [page]="query.page"
        [pageSize]="pageSize"
        [hasFilters]="list.hasActiveFilters()"
        emptyTitle="Todavía no hay documentos"
        emptyMessage="Sube un manual, guía o diagrama de arquitectura (PDF, Office, imágenes o texto)."
        (retry)="list.reload()"
        (clearFilters)="list.clearFilters()"
        (pageChange)="list.update({ page: $event })"
      >
        <a empty-action routerLink="new" class="btn btn-primary">Subir documento</a>
        <ul
          class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 group-data-[layout=list]/list:grid-cols-1 group-data-[layout=list]/list:gap-2"
        >
          @for (manual of items(); track manual.id) {
            <li>
              <app-resource-card
                favoriteType="manual"
                [resource]="manual"
                [link]="['/manuals', manual.id]"
              >
                <span class="badge">{{ categoryLabel(manual.category) }}</span>
                <span class="badge"
                  >{{ fileLabel(manual.mime_type) }} · {{ size(manual.file_size) }}</span
                >
                <span class="badge" [title]="manual.download_count + ' descargas'">
                  <app-icon name="download" iconClass="me-1 size-3" />{{ manual.download_count }}
                </span>
              </app-resource-card>
            </li>
          }
        </ul>
      </app-list-view>
    </div>
  `,
})
export class ManualsListPage {
  protected readonly list = new ResourceListStore<Manual, ManualFilters>(
    inject(ManualsService),
    MANUAL_FILTER_CODEC,
    PAGE_SIZE,
  );
  protected readonly items = computed(() => this.list.page()?.items ?? []);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly categories = MANUAL_CATEGORIES;
  protected readonly categoryLabel = manualCategoryLabel;
  protected readonly fileLabel = manualFileLabel;
  protected readonly size = formatBytes;

  protected onCategory(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.list.update({ filters: { category: oneOf(value, MANUAL_CATEGORY_VALUES) } });
  }
}
