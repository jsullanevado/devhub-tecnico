import { SCRIPT_CATEGORIES, SCRIPT_LANGUAGES, ScriptFilters } from '../../core/models';
import { FilterCodec, oneOf } from '../../shared/resources/list-query';

const CATEGORY_VALUES = SCRIPT_CATEGORIES.map((item) => item.value);
const LANGUAGE_VALUES = SCRIPT_LANGUAGES.map((item) => item.value);

/** Filtros de scripts en la URL: ?category=sql&language=sql&template=yes */
export const SCRIPT_FILTER_CODEC: FilterCodec<ScriptFilters> = {
  parse: (params) => {
    const template = params.get('template');
    return {
      category: oneOf(params.get('category'), CATEGORY_VALUES),
      language: oneOf(params.get('language'), LANGUAGE_VALUES),
      isTemplate: template === 'yes' ? true : template === 'no' ? false : undefined,
    };
  },
  toParams: (filters) => ({
    category: filters.category ?? null,
    language: filters.language ?? null,
    template: filters.isTemplate === undefined ? null : filters.isTemplate ? 'yes' : 'no',
  }),
};

export function scriptCategoryLabel(category: string): string {
  return SCRIPT_CATEGORIES.find((item) => item.value === category)?.label ?? category;
}

export { CATEGORY_VALUES as SCRIPT_CATEGORY_VALUES, LANGUAGE_VALUES as SCRIPT_LANGUAGE_VALUES };
