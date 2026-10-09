import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LessonsService } from '../../core/data/lessons.service';
import {
  LESSON_CATEGORIES,
  LESSON_SEVERITIES,
  LESSON_STATUSES,
  LessonFilters,
  LessonSummary,
} from '../../core/models';
import { oneOf } from '../../shared/resources/list-query';
import { ListToolbar } from '../../shared/resources/list-toolbar';
import { ListView } from '../../shared/resources/list-view';
import { ResourceCard } from '../../shared/resources/resource-card';
import { ResourceListStore } from '../../shared/resources/resource-list.store';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { SearchBox } from '../../shared/ui/search-box/search-box';
import { LessonBadges } from './lesson-badges';
import {
  LESSON_CATEGORY_VALUES,
  LESSON_FILTER_CODEC,
  LESSON_SEVERITY_VALUES,
  LESSON_STATUS_VALUES,
} from './lessons.codec';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-lessons-list-page',
  imports: [
    RouterLink,
    PageHeader,
    ListToolbar,
    ListView,
    ResourceCard,
    SearchBox,
    LessonBadges,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let query = list.query();
    <div class="mx-auto max-w-6xl space-y-6">
      <app-page-header
        title="Lecciones aprendidas"
        description="Incidencias técnicas, causas raíz, soluciones y conclusiones del equipo."
      >
        <a routerLink="new" class="btn btn-primary">
          <app-icon name="plus" iconClass="size-4" /> Registrar lección
        </a>
      </app-page-header>

      <app-list-toolbar
        subject="lecciones"
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
        <select class="input w-auto" aria-label="Severidad" (change)="onSeverity($event)">
          <option value="">Toda severidad</option>
          @for (option of severities; track option.value) {
            <option [value]="option.value" [selected]="option.value === query.filters.severity">
              {{ option.label }}
            </option>
          }
        </select>
        <select class="input w-auto" aria-label="Estado" (change)="onStatus($event)">
          <option value="">Todos los estados</option>
          @for (option of statuses; track option.value) {
            <option [value]="option.value" [selected]="option.value === query.filters.status">
              {{ option.label }}
            </option>
          }
        </select>
        <select class="input w-auto" aria-label="Categoría" (change)="onCategory($event)">
          <option value="">Todas las categorías</option>
          @for (option of categories; track option.value) {
            <option [value]="option.value" [selected]="option.value === query.filters.category">
              {{ option.label }}
            </option>
          }
        </select>
        <app-search-box
          class="w-44"
          [value]="query.filters.technology ?? ''"
          placeholder="Tecnología"
          label="Filtrar por tecnología exacta"
          (valueChange)="list.update({ filters: { technology: $event || undefined } })"
        />
      </app-list-toolbar>

      <app-list-view
        [loading]="list.loading()"
        [error]="list.error()"
        [total]="list.page()?.total ?? null"
        [page]="query.page"
        [pageSize]="pageSize"
        [hasFilters]="list.hasActiveFilters()"
        emptyTitle="Todavía no hay lecciones registradas"
        emptyMessage="Documenta una incidencia y su solución para que el equipo no tropiece dos veces con lo mismo."
        (retry)="list.reload()"
        (clearFilters)="list.clearFilters()"
        (pageChange)="list.update({ page: $event })"
      >
        <a empty-action routerLink="new" class="btn btn-primary">Registrar lección</a>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (lesson of items(); track lesson.id) {
            <li>
              <app-resource-card
                favoriteType="lesson"
                [resource]="lesson"
                [link]="['/lessons', lesson.id]"
              >
                <app-lesson-badges [lesson]="lesson" />
              </app-resource-card>
            </li>
          }
        </ul>
      </app-list-view>
    </div>
  `,
})
export class LessonsListPage {
  protected readonly list = new ResourceListStore<LessonSummary, LessonFilters>(
    inject(LessonsService),
    LESSON_FILTER_CODEC,
    PAGE_SIZE,
  );
  protected readonly items = computed(() => this.list.page()?.items ?? []);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly severities = LESSON_SEVERITIES;
  protected readonly statuses = LESSON_STATUSES;
  protected readonly categories = LESSON_CATEGORIES;

  protected onSeverity(event: Event): void {
    this.list.update({ filters: { severity: oneOf(selectValue(event), LESSON_SEVERITY_VALUES) } });
  }

  protected onStatus(event: Event): void {
    this.list.update({ filters: { status: oneOf(selectValue(event), LESSON_STATUS_VALUES) } });
  }

  protected onCategory(event: Event): void {
    this.list.update({ filters: { category: oneOf(selectValue(event), LESSON_CATEGORY_VALUES) } });
  }
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}
