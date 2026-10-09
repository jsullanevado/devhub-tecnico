import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { SearchService } from '../core/data/search.service';
import {
  RESOURCE_TYPE_LABELS,
  ResourceType,
  SEARCH_MIN_LENGTH,
  SearchResult,
  SearchState,
} from '../core/models';
import { RESOURCE_PATHS } from '../core/routing/app-paths';
import { Icon, IconName } from '../shared/ui/icon/icon';
import { Spinner } from '../shared/ui/spinner/spinner';
import { LayoutService } from './layout.service';

const TYPE_ICON: Record<ResourceType, IconName> = {
  script: 'code',
  lesson: 'lightbulb',
  note: 'note',
  manual: 'book',
};

/**
 * Buscador global (Ctrl/⌘ + K). Patrón combobox + listbox: el foco permanece en
 * el campo y las flechas mueven la opción activa (aria-activedescendant).
 */
@Component({
  selector: 'app-search-palette',
  imports: [Icon, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="card m-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50 dark:text-slate-100"
      aria-label="Búsqueda global"
      (close)="layout.closeSearch()"
      (click)="onDialogClick($event)"
    >
      <div class="flex items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
        <app-icon name="search" iconClass="size-5 text-slate-400" />
        <input
          #input
          type="text"
          role="combobox"
          aria-label="Buscar scripts, lecciones, notas y manuales"
          aria-autocomplete="list"
          aria-controls="search-results"
          [attr.aria-expanded]="results().length > 0"
          [attr.aria-activedescendant]="activeOptionId()"
          class="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Buscar scripts, lecciones, notas, manuales…"
          autocomplete="off"
          spellcheck="false"
          [value]="term()"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
        />
        @if (state().status === 'loading') {
          <app-spinner size="sm" label="Buscando…" />
        }
        <kbd class="kbd">Esc</kbd>
      </div>

      <div class="max-h-[60vh] overflow-y-auto p-2">
        @switch (state().status) {
          @case ('idle') {
            <p class="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Escribe al menos {{ minLength }} caracteres. Usa "comillas" para frases exactas y
              -palabra para excluir.
            </p>
          }
          @case ('error') {
            <p role="alert" class="px-3 py-6 text-center text-sm text-red-600 dark:text-red-400">
              {{ errorMessage() }}
            </p>
          }
          @case ('success') {
            @if (results().length === 0) {
              <p
                role="status"
                class="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                Sin resultados para «{{ state().term }}».
              </p>
            }
          }
        }

        <ul id="search-results" role="listbox" aria-label="Resultados de búsqueda">
          @for (result of results(); track result.resource_type + result.id; let index = $index) {
            <li
              [id]="optionId(index)"
              role="option"
              [attr.aria-selected]="index === activeIndex()"
              class="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 aria-selected:bg-indigo-50 dark:aria-selected:bg-indigo-500/10"
              (mousemove)="activeIndex.set(index)"
              (click)="open(result)"
            >
              <app-icon
                [name]="typeIcon[result.resource_type]"
                iconClass="mt-0.5 size-5 text-slate-400"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ result.title }}</p>
                @if (result.description) {
                  <p class="truncate text-xs text-slate-500 dark:text-slate-400">
                    {{ result.description }}
                  </p>
                }
              </div>
              <span class="badge shrink-0">{{ typeLabel[result.resource_type] }}</span>
            </li>
          }
        </ul>
      </div>

      <div
        class="flex gap-4 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
        aria-hidden="true"
      >
        <span><kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> navegar</span>
        <span><kbd class="kbd">Enter</kbd> abrir</span>
        <span><kbd class="kbd">Esc</kbd> cerrar</span>
      </div>
    </dialog>
  `,
})
export class SearchPalette {
  protected readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly searchService = inject(SearchService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly minLength = SEARCH_MIN_LENGTH;
  protected readonly typeIcon = TYPE_ICON;
  protected readonly typeLabel = RESOURCE_TYPE_LABELS;

  private readonly terms$ = new Subject<string>();
  protected readonly term = signal('');
  protected readonly state = toSignal(this.searchService.searchAsYouType(this.terms$), {
    initialValue: { status: 'idle', term: '', results: [] } as SearchState,
  });
  protected readonly results = computed<SearchResult[]>(() => this.state().results);
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : '';
  });
  protected readonly activeIndex = signal(0);
  protected readonly activeOptionId = computed(() =>
    this.results().length > 0 ? this.optionId(this.activeIndex()) : null,
  );

  constructor() {
    afterRenderEffect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.layout.searchOpen() && !dialog.open) {
        dialog.showModal();
        const input = this.input().nativeElement;
        const seed = this.layout.consumeSearchSeed();
        if (seed !== null) {
          input.value = seed;
          untracked(() => this.term.set(seed));
          this.terms$.next(seed);
        }
        input.focus();
        input.select();
      } else if (!this.layout.searchOpen() && dialog.open) {
        // El <dialog> nativo devuelve el foco al elemento que lo abrió.
        dialog.close();
      }
    });

    effect(() => {
      this.results();
      untracked(() => this.activeIndex.set(0));
    });

    afterRenderEffect(() => {
      const id = this.activeOptionId();
      if (id) {
        this.dialog().nativeElement.querySelector(`#${id}`)?.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  protected optionId(index: number): string {
    return `search-option-${index}`;
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.term.set(value);
    this.terms$.next(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) {
          this.activeIndex.update((index) => (index + 1) % count);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) {
          this.activeIndex.update((index) => (index - 1 + count) % count);
        }
        break;
      case 'Enter': {
        const result = this.results()[this.activeIndex()];
        if (result) {
          event.preventDefault();
          this.open(result);
        }
        break;
      }
    }
  }

  protected open(result: SearchResult): void {
    this.layout.closeSearch();
    void this.router.navigateByUrl(`${RESOURCE_PATHS[result.resource_type]}/${result.id}`);
  }

  /** Clic en el fondo (fuera del contenido) cierra el diálogo. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.layout.closeSearch();
    }
  }
}
