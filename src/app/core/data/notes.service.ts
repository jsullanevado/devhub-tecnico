import { Injectable } from '@angular/core';
import { Note, NoteFilters, NoteInput, NoteSummary } from '../models';
import { AUTHOR_EMBED } from './query-utils';
import { FilterCondition, ResourceRepository } from './resource-repository';

const SUMMARY_COLUMNS =
  'id, owner_id, title, description, category, tags, visibility, created_at, updated_at';

@Injectable({ providedIn: 'root' })
export class NotesService extends ResourceRepository<NoteSummary, Note, NoteInput, NoteFilters> {
  protected readonly table = 'notes';
  protected readonly summaryColumns = `${SUMMARY_COLUMNS}, ${AUTHOR_EMBED}`;
  protected readonly detailColumns = `${SUMMARY_COLUMNS}, content, ${AUTHOR_EMBED}`;

  protected toConditions(filters: NoteFilters): FilterCondition[] {
    return filters.category
      ? [{ column: 'category', operator: 'eq', value: filters.category }]
      : [];
  }
}
