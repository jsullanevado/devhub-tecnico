import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  debounceTime,
  distinctUntilChanged,
  from,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { toAppError } from '../errors/error-mapper';
import { SEARCH_MIN_LENGTH, SearchOptions, SearchResult, SearchState } from '../models';
import { SUPABASE } from '../supabase/supabase.client';
import { clamp } from './query-utils';

const SEARCH_DEBOUNCE_MS = 250;

/** Búsqueda global sobre los cuatro tipos de recurso (RPC search_resources, respeta RLS). */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly supabase = inject(SUPABASE);

  async search(term: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const query = term.trim();
    if (query.length < SEARCH_MIN_LENGTH) {
      return [];
    }
    const { data, error } = await this.supabase.rpc('search_resources', {
      p_query: query,
      p_types: options.types,
      p_limit: clamp(options.limit ?? 20, 1, 50),
      p_offset: Math.max(0, options.offset ?? 0),
    });
    if (error) {
      throw toAppError(error);
    }
    return (data ?? []) as SearchResult[];
  }

  /**
   * Búsqueda mientras se escribe: debounce, descarta términos repetidos y
   * cancela la petición anterior (switchMap) para evitar resultados desordenados.
   */
  searchAsYouType(
    terms$: Observable<string>,
    options: SearchOptions = {},
  ): Observable<SearchState> {
    return terms$.pipe(
      map((term) => term.trim()),
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((term): Observable<SearchState> => {
        if (term.length < SEARCH_MIN_LENGTH) {
          return of({ status: 'idle', term, results: [] });
        }
        return from(this.search(term, options)).pipe(
          map((results): SearchState => ({ status: 'success', term, results })),
          catchError((error: unknown) =>
            of<SearchState>({
              status: 'error',
              term,
              results: [],
              message: toAppError(error).message,
            }),
          ),
          startWith<SearchState>({ status: 'loading', term, results: [] }),
        );
      }),
    );
  }
}
