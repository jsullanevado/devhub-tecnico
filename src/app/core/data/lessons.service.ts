import { Injectable } from '@angular/core';
import { LessonFilters, LessonInput, LessonLearned, LessonSummary } from '../models';
import { AUTHOR_EMBED, escapeLike } from './query-utils';
import { FilterCondition, ResourceRepository } from './resource-repository';

const SUMMARY_COLUMNS =
  'id, owner_id, title, description, severity, technology, category, status, occurred_on, tags, visibility, created_at, updated_at';

@Injectable({ providedIn: 'root' })
export class LessonsService extends ResourceRepository<
  LessonSummary,
  LessonLearned,
  LessonInput,
  LessonFilters
> {
  protected readonly table = 'lessons_learned';
  protected readonly summaryColumns = `${SUMMARY_COLUMNS}, ${AUTHOR_EMBED}`;
  protected readonly detailColumns = `${SUMMARY_COLUMNS}, problem, root_cause, solution, conclusion, ${AUTHOR_EMBED}`;

  protected toConditions(filters: LessonFilters): FilterCondition[] {
    const conditions: FilterCondition[] = [];
    if (filters.severity) {
      conditions.push({ column: 'severity', operator: 'eq', value: filters.severity });
    }
    if (filters.category) {
      conditions.push({ column: 'category', operator: 'eq', value: filters.category });
    }
    if (filters.status) {
      conditions.push({ column: 'status', operator: 'eq', value: filters.status });
    }
    const technology = filters.technology?.trim();
    if (technology) {
      // Coincidencia exacta sin distinguir mayúsculas.
      conditions.push({ column: 'technology', operator: 'ilike', value: escapeLike(technology) });
    }
    return conditions;
  }
}
