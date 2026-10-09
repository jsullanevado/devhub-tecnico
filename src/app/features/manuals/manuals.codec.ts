import { MANUAL_CATEGORIES, ManualFilters } from '../../core/models';
import { FilterCodec, oneOf } from '../../shared/resources/list-query';

export const MANUAL_CATEGORY_VALUES = MANUAL_CATEGORIES.map((item) => item.value);

/** Filtros en la URL: ?category=architecture */
export const MANUAL_FILTER_CODEC: FilterCodec<ManualFilters> = {
  parse: (params) => ({ category: oneOf(params.get('category'), MANUAL_CATEGORY_VALUES) }),
  toParams: (filters) => ({ category: filters.category ?? null }),
};

export function manualCategoryLabel(category: string): string {
  return MANUAL_CATEGORIES.find((item) => item.value === category)?.label ?? category;
}
