import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScriptsService } from '../../core/data/scripts.service';
import {
  SCRIPT_CATEGORIES,
  SCRIPT_LANGUAGES,
  ScriptFilters,
  ScriptSummary,
  scriptLanguageLabel,
} from '../../core/models';
import { oneOf } from '../../shared/resources/list-query';
import { ListToolbar } from '../../shared/resources/list-toolbar';
import { ListView } from '../../shared/resources/list-view';
import { ResourceCard } from '../../shared/resources/resource-card';
import { ResourceListStore } from '../../shared/resources/resource-list.store';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import {
  SCRIPT_CATEGORY_VALUES,
  SCRIPT_FILTER_CODEC,
  SCRIPT_LANGUAGE_VALUES,
  scriptCategoryLabel,
} from './scripts.codec';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-scripts-list-page',
  imports: [RouterLink, PageHeader, ListToolbar, ListView, ResourceCard, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let query = list.query();
    <div class="mx-auto max-w-6xl space-y-6">
      <app-page-header
        title="Scripts y plantillas"
        description="Fragmentos SOAP, REST, SQL, Bash y más, listos para copiar o descargar."
      >
        <a routerLink="new" class="btn btn-primary">
          <app-icon name="plus" iconClass="size-4" /> Nuevo script
        </a>
      </app-page-header>

      <app-list-toolbar
        subject="scripts"
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
        <select class="input w-auto" aria-label="Lenguaje" (change)="onLanguage($event)">
          <option value="">Todos los lenguajes</option>
          @for (option of languages; track option.value) {
            <option [value]="option.value" [selected]="option.value === query.filters.language">
              {{ option.label }}
            </option>
          }
        </select>
        <select class="input w-auto" aria-label="Tipo" (change)="onTemplate($event)">
          <option value="" [selected]="query.filters.isTemplate === undefined">
            Scripts y plantillas
          </option>
          <option value="yes" [selected]="query.filters.isTemplate === true">
            Solo plantillas
          </option>
          <option value="no" [selected]="query.filters.isTemplate === false">Solo scripts</option>
        </select>
      </app-list-toolbar>

      <app-list-view
        [loading]="list.loading()"
        [error]="list.error()"
        [total]="list.page()?.total ?? null"
        [page]="query.page"
        [pageSize]="pageSize"
        [hasFilters]="list.hasActiveFilters()"
        emptyTitle="Todavía no hay scripts"
        emptyMessage="Crea el primero y compártelo con tu equipo o guárdalo como privado."
        (retry)="list.reload()"
        (clearFilters)="list.clearFilters()"
        (pageChange)="list.update({ page: $event })"
      >
        <a empty-action routerLink="new" class="btn btn-primary">Nuevo script</a>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (script of items(); track script.id) {
            <li>
              <app-resource-card
                favoriteType="script"
                [resource]="script"
                [link]="['/scripts', script.id]"
              >
                <span class="badge">{{ categoryLabel(script.category) }}</span>
                <span class="badge font-mono">{{ languageLabel(script.language) }}</span>
                @if (script.is_template) {
                  <span
                    class="badge bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                  >
                    Plantilla
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
export class ScriptsListPage {
  protected readonly list = new ResourceListStore<ScriptSummary, ScriptFilters>(
    inject(ScriptsService),
    SCRIPT_FILTER_CODEC,
    PAGE_SIZE,
  );
  protected readonly items = computed(() => this.list.page()?.items ?? []);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly categories = SCRIPT_CATEGORIES;
  protected readonly languages = SCRIPT_LANGUAGES;
  protected readonly categoryLabel = scriptCategoryLabel;
  protected readonly languageLabel = scriptLanguageLabel;

  protected onCategory(event: Event): void {
    this.list.update({ filters: { category: oneOf(selectValue(event), SCRIPT_CATEGORY_VALUES) } });
  }

  protected onLanguage(event: Event): void {
    this.list.update({ filters: { language: oneOf(selectValue(event), SCRIPT_LANGUAGE_VALUES) } });
  }

  protected onTemplate(event: Event): void {
    const value = selectValue(event);
    this.list.update({ filters: { isTemplate: value === '' ? undefined : value === 'yes' } });
  }
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}
