import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotesService } from '../../core/data/notes.service';
import { NOTE_CATEGORIES, NoteFilters, NoteSummary } from '../../core/models';
import { oneOf } from '../../shared/resources/list-query';
import { ListToolbar } from '../../shared/resources/list-toolbar';
import { ListView } from '../../shared/resources/list-view';
import { ResourceCard } from '../../shared/resources/resource-card';
import { ResourceListStore } from '../../shared/resources/resource-list.store';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { NOTE_CATEGORY_VALUES, NOTE_FILTER_CODEC, noteCategoryLabel } from './notes.codec';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-notes-list-page',
  imports: [RouterLink, PageHeader, ListToolbar, ListView, ResourceCard, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let query = list.query();
    <div class="mx-auto max-w-6xl space-y-6">
      <app-page-header
        title="Notas técnicas"
        description="Artículos, guías prácticas y contenido tipo wiki en Markdown."
      >
        <a routerLink="new" class="btn btn-primary">
          <app-icon name="plus" iconClass="size-4" /> Nueva nota
        </a>
      </app-page-header>

      <app-list-toolbar
        viewKey="notes"
        subject="notas"
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
        viewKey="notes"
        [loading]="list.loading()"
        [error]="list.error()"
        [total]="list.page()?.total ?? null"
        [page]="query.page"
        [pageSize]="pageSize"
        [hasFilters]="list.hasActiveFilters()"
        emptyTitle="Todavía no hay notas"
        emptyMessage="Escribe la primera guía o artículo técnico para tu equipo."
        (retry)="list.reload()"
        (clearFilters)="list.clearFilters()"
        (pageChange)="list.update({ page: $event })"
      >
        <a empty-action routerLink="new" class="btn btn-primary">Nueva nota</a>
        <ul
          class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 group-data-[layout=list]/list:grid-cols-1 group-data-[layout=list]/list:gap-2"
        >
          @for (note of items(); track note.id) {
            <li>
              <app-resource-card favoriteType="note" [resource]="note" [link]="['/notes', note.id]">
                <span class="badge">{{ categoryLabel(note.category) }}</span>
              </app-resource-card>
            </li>
          }
        </ul>
      </app-list-view>
    </div>
  `,
})
export class NotesListPage {
  protected readonly list = new ResourceListStore<NoteSummary, NoteFilters>(
    inject(NotesService),
    NOTE_FILTER_CODEC,
    PAGE_SIZE,
  );
  protected readonly items = computed(() => this.list.page()?.items ?? []);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly categories = NOTE_CATEGORIES;
  protected readonly categoryLabel = noteCategoryLabel;

  protected onCategory(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.list.update({ filters: { category: oneOf(value, NOTE_CATEGORY_VALUES) } });
  }
}
