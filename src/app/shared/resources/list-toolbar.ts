import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ResourceScope, ResourceSortField } from '../../core/models';
import { TagInput } from '../forms/tag-input';
import { SearchBox } from '../ui/search-box/search-box';
import { ViewToggle } from './view-mode';
import { oneOf, SCOPE_OPTIONS, SORT_OPTIONS } from './list-query';

const SCOPES = SCOPE_OPTIONS.map((option) => option.value);
const SORTS = SORT_OPTIONS.map((option) => option.value);

/**
 * Barra de filtros comunes (texto, etiquetas, ámbito y orden). Los filtros
 * propios del módulo se proyectan como contenido (selects).
 */
@Component({
  selector: 'app-list-toolbar',
  imports: [ReactiveFormsModule, SearchBox, TagInput, ViewToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="card space-y-3 p-4" role="search" [attr.aria-label]="'Filtrar ' + subject()">
      <div class="flex flex-col gap-3 md:flex-row md:items-start">
        <app-search-box
          class="md:flex-[3]"
          [value]="search()"
          [placeholder]="'Buscar ' + subject() + '…'"
          [label]="'Buscar ' + subject()"
          (valueChange)="searchChange.emit($event)"
        />
        <app-tag-input
          class="md:flex-[2]"
          inputId="filter-tags"
          placeholder="Filtrar por etiquetas (Enter)"
          [formControl]="tagsControl"
        />
      </div>
      <div
        class="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"
      >
        <select class="input w-auto" aria-label="Ámbito" (change)="onScope($event)">
          @for (option of scopeOptions; track option.value) {
            <option [value]="option.value" [selected]="option.value === scope()">
              {{ option.label }}
            </option>
          }
        </select>
        <ng-content />
        <div class="flex flex-wrap items-center gap-2 sm:ms-auto">
          @if (hasFilters()) {
            <button type="button" class="link text-sm" (click)="clear.emit()">
              Limpiar filtros
            </button>
          }
          @if (viewKey(); as key) {
            <app-view-toggle [viewKey]="key" />
          }
          <label class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            Ordenar
            <select class="input w-auto" (change)="onSort($event)">
              @for (option of sortOptions; track option.value) {
                <option [value]="option.value" [selected]="option.value === sort()">
                  {{ option.label }}
                </option>
              }
            </select>
          </label>
        </div>
      </div>
    </div>
  `,
})
export class ListToolbar {
  readonly subject = input.required<string>();
  readonly search = input('');
  readonly tags = input<readonly string[]>([]);
  readonly scope = input<ResourceScope>('all');
  readonly sort = input<ResourceSortField>('updated_at');
  readonly hasFilters = input(false);
  /** Módulo para el selector Tarjetas / Lista (sin él no se muestra). */
  readonly viewKey = input<string>();

  readonly searchChange = output<string>();
  readonly tagsChange = output<string[]>();
  readonly scopeChange = output<ResourceScope>();
  readonly sortChange = output<ResourceSortField>();
  readonly clear = output<void>();

  protected readonly scopeOptions = SCOPE_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly tagsControl = new FormControl<string[]>([], { nonNullable: true });

  constructor() {
    // URL → control (sin reemitir) y control → salida.
    effect(() => this.tagsControl.setValue([...this.tags()], { emitEvent: false }));
    this.tagsControl.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((tags) => this.tagsChange.emit(tags));
  }

  protected onScope(event: Event): void {
    const value = oneOf((event.target as HTMLSelectElement).value, SCOPES);
    if (value) {
      this.scopeChange.emit(value);
    }
  }

  protected onSort(event: Event): void {
    const value = oneOf((event.target as HTMLSelectElement).value, SORTS);
    if (value) {
      this.sortChange.emit(value);
    }
  }
}
