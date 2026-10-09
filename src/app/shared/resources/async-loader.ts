import { Signal, computed, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, from, map, of, startWith, switchMap } from 'rxjs';
import { toAppError } from '../../core/errors/error-mapper';

export type AsyncState<T> =
  | { status: 'idle'; value: null; error: null }
  | { status: 'loading'; value: null; error: null }
  | { status: 'success'; value: T; error: null }
  | { status: 'error'; value: null; error: string };

const IDLE = { status: 'idle', value: null, error: null } as const;
const LOADING = { status: 'loading', value: null, error: null } as const;

export interface AsyncLoader<T> {
  readonly state: Signal<AsyncState<T>>;
  readonly value: Signal<T | null>;
  reload(): void;
}

/**
 * Carga asíncrona dependiente de un parámetro reactivo (p. ej. el :id de la ruta).
 * Cancela la petición anterior si el parámetro cambia (switchMap). Parámetro
 * null/undefined → estado 'idle'. Requiere contexto de inyección.
 */
export function createAsyncLoader<P, T>(
  params: () => P | null | undefined,
  loader: (params: P) => Promise<T>,
): AsyncLoader<T> {
  const version = signal(0);
  const trigger = computed(() => ({ params: params(), version: version() }));

  const state = toSignal(
    toObservable(trigger).pipe(
      switchMap(({ params: current }) =>
        current === null || current === undefined
          ? of<AsyncState<T>>(IDLE)
          : from(loader(current)).pipe(
              map((value): AsyncState<T> => ({ status: 'success', value, error: null })),
              catchError((error: unknown) =>
                of<AsyncState<T>>({
                  status: 'error',
                  value: null,
                  error: toAppError(error).message,
                }),
              ),
              startWith<AsyncState<T>>(LOADING),
            ),
      ),
    ),
    { initialValue: LOADING as AsyncState<T> },
  );

  return {
    state,
    value: computed(() => state().value),
    reload: () => version.update((current) => current + 1),
  };
}
