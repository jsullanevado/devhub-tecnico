import { Signal, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Subject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  from,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { toAppError } from '../../core/errors/error-mapper';
import { BaseResource, Page, ResourceListQuery } from '../../core/models';
import { FilterCodec, ListQuery, parseListQuery, serializeListQuery } from './list-query';

/** Fuente de datos paginada (los repositorios de recursos la cumplen). */
export interface ListSource<TItem, TFilters extends object> {
  list(query: ResourceListQuery<TFilters>): Promise<Page<TItem>>;
}

export type ListChanges<TFilters> = Partial<Omit<ListQuery<TFilters>, 'filters'>> & {
  filters?: Partial<TFilters>;
};

/**
 * Estado de un listado con la URL como fuente de verdad:
 * URL → consulta → petición (switchMap cancela la anterior) → resultados.
 * Los cambios de filtros se escriben en la URL, de modo que atrás/adelante,
 * recargar y compartir el enlace conservan la búsqueda.
 * Crear en un inicializador de campo del componente (contexto de inyección).
 */
export class ResourceListStore<TItem extends BaseResource, TFilters extends object> {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly reload$ = new Subject<void>();
  private readonly lastPage = signal<Page<TItem> | null>(null);

  readonly query: Signal<ListQuery<TFilters>>;
  readonly page = this.lastPage.asReadonly();
  readonly loading: Signal<boolean>;
  readonly error: Signal<string | null>;
  readonly hasActiveFilters = computed(() => {
    const query = this.query();
    return (
      query.search !== '' ||
      query.tags.length > 0 ||
      query.scope !== 'all' ||
      Object.values(query.filters).some((value) => value !== undefined)
    );
  });

  constructor(
    source: ListSource<TItem, TFilters>,
    private readonly codec: FilterCodec<TFilters>,
    private readonly pageSize = 12,
  ) {
    const query$ = this.route.queryParamMap.pipe(
      map((params) => parseListQuery(params, codec)),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    );
    this.query = toSignal(query$, { requireSync: true });

    const status = toSignal(
      combineLatest([query$, this.reload$.pipe(startWith(undefined))]).pipe(
        switchMap(([query]) =>
          from(
            source.list({
              search: query.search,
              tags: query.tags,
              scope: query.scope,
              sort: query.sort,
              page: query.page,
              pageSize: this.pageSize,
              filters: query.filters,
            }),
          ).pipe(
            tap((page) => this.lastPage.set(page)),
            map(() => ({ loading: false, error: null as string | null })),
            catchError((error: unknown) =>
              of({ loading: false, error: toAppError(error).message as string | null }),
            ),
            startWith({ loading: true, error: null as string | null }),
          ),
        ),
      ),
      { initialValue: { loading: true, error: null } },
    );
    this.loading = computed(() => status().loading);
    this.error = computed(() => status().error);
  }

  /** Aplica cambios; salvo que se indique `page`, vuelve a la página 1. */
  update(changes: ListChanges<TFilters>): void {
    const current = this.query();
    const next: ListQuery<TFilters> = {
      ...current,
      ...changes,
      filters: { ...current.filters, ...changes.filters },
      page: changes.page ?? 1,
    };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: serializeListQuery(next, this.codec),
      // Los cambios de página crean entrada en el historial; los de filtros la reemplazan.
      replaceUrl: changes.page === undefined,
    });
  }

  clearFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  reload(): void {
    this.reload$.next();
  }
}
