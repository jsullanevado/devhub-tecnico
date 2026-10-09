import { ParamMap } from '@angular/router';
import { areTagsValid, normalizeTags, ResourceScope, ResourceSortField } from '../../core/models';

/** Estado de un listado tal como se refleja en la URL (compartible y con historial). */
export interface ListQuery<TFilters> {
  search: string;
  tags: string[];
  scope: ResourceScope;
  sort: ResourceSortField;
  page: number;
  filters: TFilters;
}

/** Traduce los filtros propios de cada módulo desde/hacia parámetros de URL. */
export interface FilterCodec<TFilters> {
  /** Debe ignorar valores desconocidos: la URL la puede editar cualquiera. */
  parse(params: ParamMap): TFilters;
  toParams(filters: TFilters): Record<string, string | null>;
}

const SCOPES: readonly ResourceScope[] = ['all', 'mine', 'public'];
const SORTS: readonly ResourceSortField[] = ['updated_at', 'created_at', 'title'];
const SEARCH_MAX_LENGTH = 200;

export const SCOPE_OPTIONS = [
  { value: 'all', label: 'Todos los visibles' },
  { value: 'mine', label: 'Solo míos' },
  { value: 'public', label: 'Solo públicos' },
] as const satisfies readonly { value: ResourceScope; label: string }[];

export const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Actualizados recientemente' },
  { value: 'created_at', label: 'Creados recientemente' },
  { value: 'title', label: 'Título (A-Z)' },
] as const satisfies readonly { value: ResourceSortField; label: string }[];

/** Devuelve el valor solo si pertenece a la lista permitida. */
export function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export function parseListQuery<TFilters>(
  params: ParamMap,
  codec: FilterCodec<TFilters>,
): ListQuery<TFilters> {
  const tags = normalizeTags((params.get('tags') ?? '').split(','));
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return {
    search: (params.get('q') ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
    tags: areTagsValid(tags) ? tags : [],
    scope: oneOf(params.get('scope'), SCOPES) ?? 'all',
    sort: oneOf(params.get('sort'), SORTS) ?? 'updated_at',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    filters: codec.parse(params),
  };
}

/** Parámetros de URL mínimos (omite los valores por defecto). */
export function serializeListQuery<TFilters>(
  query: ListQuery<TFilters>,
  codec: FilterCodec<TFilters>,
): Record<string, string> {
  const raw: Record<string, string | null> = {
    q: query.search.trim() || null,
    tags: query.tags.length ? query.tags.join(',') : null,
    scope: query.scope !== 'all' ? query.scope : null,
    sort: query.sort !== 'updated_at' ? query.sort : null,
    page: query.page > 1 ? String(query.page) : null,
    ...codec.toParams(query.filters),
  };
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => entry[1] !== null),
  );
}
