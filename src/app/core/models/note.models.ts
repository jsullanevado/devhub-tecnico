import { BaseResource, BaseResourceInput } from './common.models';

// Mantener sincronizado con el CHECK notes_category_valid.
export const NOTE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'article', label: 'Artículo' },
  { value: 'wiki', label: 'Wiki' },
  { value: 'howto', label: 'Guía práctica' },
  { value: 'reference', label: 'Referencia' },
] as const;

export type NoteCategory = (typeof NOTE_CATEGORIES)[number]['value'];

export const NOTE_LIMITS = {
  contentMax: 100_000,
} as const;

/** Versión de listado: sin `content`. */
export interface NoteSummary extends BaseResource {
  category: NoteCategory;
}

export interface Note extends NoteSummary {
  /** Markdown. */
  content: string;
}

export interface NoteInput extends BaseResourceInput {
  content: string;
  category?: NoteCategory;
}

export interface NoteFilters {
  category?: NoteCategory;
}
