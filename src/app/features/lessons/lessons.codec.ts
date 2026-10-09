import {
  LESSON_CATEGORIES,
  LESSON_LIMITS,
  LESSON_SEVERITIES,
  LESSON_STATUSES,
  LessonFilters,
} from '../../core/models';
import { FilterCodec, oneOf } from '../../shared/resources/list-query';

export const LESSON_SEVERITY_VALUES = LESSON_SEVERITIES.map((item) => item.value);
export const LESSON_CATEGORY_VALUES = LESSON_CATEGORIES.map((item) => item.value);
export const LESSON_STATUS_VALUES = LESSON_STATUSES.map((item) => item.value);

/** Filtros en la URL: ?severity=high&status=open&category=bug&tech=oracle */
export const LESSON_FILTER_CODEC: FilterCodec<LessonFilters> = {
  parse: (params) => ({
    severity: oneOf(params.get('severity'), LESSON_SEVERITY_VALUES),
    status: oneOf(params.get('status'), LESSON_STATUS_VALUES),
    category: oneOf(params.get('category'), LESSON_CATEGORY_VALUES),
    technology: params.get('tech')?.trim().slice(0, LESSON_LIMITS.technologyMax) || undefined,
  }),
  toParams: (filters) => ({
    severity: filters.severity ?? null,
    status: filters.status ?? null,
    category: filters.category ?? null,
    tech: filters.technology ?? null,
  }),
};

export function lessonLabel(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
