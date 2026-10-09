// Tipos y reglas compartidas por todos los recursos. Los límites reflejan los
// CHECK de la base de datos (Etapa 1): validar en el formulario evita viajes
// inútiles, pero la base de datos sigue siendo la autoridad.

export type Visibility = 'private' | 'public';

export const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Privado (solo yo)' },
  { value: 'public', label: 'Público (todo el equipo)' },
] as const satisfies readonly { value: Visibility; label: string }[];

export type ResourceType = 'script' | 'lesson' | 'note' | 'manual';

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  script: 'Script',
  lesson: 'Lección aprendida',
  note: 'Nota',
  manual: 'Manual',
};

export interface AuthorSummary {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

/** Columnas comunes a scripts, lessons_learned, notes y manuals. */
export interface BaseResource {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  tags: string[];
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  author?: AuthorSummary | null;
}

/** Campos comunes editables por el cliente. owner_id y fechas los fija la base de datos. */
export interface BaseResourceInput {
  title: string;
  description?: string | null;
  tags?: string[];
  visibility?: Visibility;
}

export type ResourceScope = 'all' | 'mine' | 'public';
export type ResourceSortField = 'updated_at' | 'created_at' | 'title';

export interface ResourceListQuery<TFilters extends object> {
  /** Texto libre (sintaxis web: "frase exacta", -excluir, a or b). */
  search?: string;
  /** Recursos que contengan TODAS estas etiquetas. */
  tags?: string[];
  scope?: ResourceScope;
  filters?: TFilters;
  sort?: ResourceSortField;
  ascending?: boolean;
  /** Página 1-based. */
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export const RESOURCE_LIMITS = {
  titleMin: 3,
  titleMax: 200,
  descriptionMax: 2000,
  tagsMax: 20,
  tagMaxLength: 40,
} as const;

/** Igual que private.tags_are_valid: alfanuméricos (con tildes) y . # + _ - */
export const TAG_PATTERN = /^[\p{L}\p{N}.#+][\p{L}\p{N}.#+_-]{0,39}$/u;

/** Igual que private.normalize_tags: minúsculas, sin vacíos, sin duplicados, ordenadas. */
export function normalizeTags(tags: readonly string[]): string[] {
  const unique = new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag !== ''));
  return [...unique].sort();
}

export function areTagsValid(tags: readonly string[]): boolean {
  return tags.length <= RESOURCE_LIMITS.tagsMax && tags.every((tag) => TAG_PATTERN.test(tag));
}
