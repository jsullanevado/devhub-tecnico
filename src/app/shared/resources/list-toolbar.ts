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
import { oneOf, SCOPE_OPTIONS, SORT_OPTIONS } from './list-query';

const SCOPES = SCOPE_OPTIONS.map((option) => option.value);
const SORTS = SORT_OPTIONS.map((option) => option.value);

/**
 * Barra de filtros comunes (texto, etiquetas, ámbito y orden). Los filtros
 * propios del módulo se proyectan como contenido (selects).
 */
@Component({
  selector: 'app-list-toolbar',
  imports: [ReactiveFormsModule, SearchBox, TagInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="card space-y-3 p-4" role="search" [attr.aria-label]="'Filtrar ' + subject()">
      <div class="grid gap-3 md:grid-cols-2">
        <app-search-box
          [value]="search()"
          [placeholder]="'Buscar ' + subject() + '…'"
          [label]="'Buscar ' + subject()"
          (valueChange)="searchChange.emit($event)"
        />
        <app-tag-input
          inputId="filter-tags"
          placeholder="Filtrar por etiquetas (Enter)"
          [formControl]="tagsControl"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select class="input w-auto" aria-label="Ámbito" (change)="onScope($event)">
          @for (option of scopeOptions; track option.value) {
            <option [value]="option.value" [selected]="option.value === scope()">
              {{ option.label }}
            </option>
          }
        </select>
        <ng-content />
        <select class="input w-auto" aria-label="Ordenar por" (change)="onSort($event)">
          @for (option of sortOptions; track option.value) {
            <option [value]="option.value" [selected]="option.value === sort()">
              {{ option.label }}
            </option>
          }
        </select>
        @if (hasFilters()) {
          <button type="button" class="link ms-auto text-sm" (click)="clear.emit()">
            Limpiar filtros
          </button>
        }
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
