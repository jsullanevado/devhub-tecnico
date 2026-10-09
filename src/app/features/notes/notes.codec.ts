import { NOTE_CATEGORIES, NoteFilters } from '../../core/models';
import { FilterCodec, oneOf } from '../../shared/resources/list-query';

export const NOTE_CATEGORY_VALUES = NOTE_CATEGORIES.map((item) => item.value);

/** Filtros en la URL: ?category=wiki */
export const NOTE_FILTER_CODEC: FilterCodec<NoteFilters> = {
  parse: (params) => ({ category: oneOf(params.get('category'), NOTE_CATEGORY_VALUES) }),
  toParams: (filters) => ({ category: filters.category ?? null }),
};

export function noteCategoryLabel(category: string): string {
  return NOTE_CATEGORIES.find((item) => item.value === category)?.label ?? category;
}
