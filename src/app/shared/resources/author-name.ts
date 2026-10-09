import { AuthorSummary } from '../../core/models';

export function authorName(author: AuthorSummary | null | undefined): string {
  return author?.full_name || author?.username || 'Usuario';
}
