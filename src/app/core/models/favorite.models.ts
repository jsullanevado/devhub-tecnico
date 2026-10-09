import { ResourceType, Visibility } from './common.models';

export interface FavoriteResourceSummary {
  id: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  updated_at: string;
}

export interface FavoriteItem {
  id: string;
  resource_type: ResourceType;
  resource_id: string;
  created_at: string;
  /** null si el recurso dejó de ser visible para el usuario (p. ej. pasó a privado). */
  resource: FavoriteResourceSummary | null;
}
