import { Injectable } from '@angular/core';
import { Script, ScriptFilters, ScriptInput, ScriptSummary } from '../models';
import { AUTHOR_EMBED } from './query-utils';
import { FilterCondition, ResourceRepository } from './resource-repository';

const SUMMARY_COLUMNS =
  'id, owner_id, title, description, category, language, is_template, tags, visibility, created_at, updated_at';

@Injectable({ providedIn: 'root' })
export class ScriptsService extends ResourceRepository<
  ScriptSummary,
  Script,
  ScriptInput,
  ScriptFilters
> {
  protected readonly table = 'scripts';
  protected readonly summaryColumns = `${SUMMARY_COLUMNS}, ${AUTHOR_EMBED}`;
  protected readonly detailColumns = `${SUMMARY_COLUMNS}, content, ${AUTHOR_EMBED}`;

  protected toConditions(filters: ScriptFilters): FilterCondition[] {
    const conditions: FilterCondition[] = [];
    if (filters.category) {
      conditions.push({ column: 'category', operator: 'eq', value: filters.category });
    }
    if (filters.language) {
      conditions.push({ column: 'language', operator: 'eq', value: filters.language });
    }
    if (filters.isTemplate !== undefined) {
      conditions.push({ column: 'is_template', operator: 'eq', value: filters.isTemplate });
    }
    return conditions;
  }
}
