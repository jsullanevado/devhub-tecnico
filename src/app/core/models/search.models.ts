import { ResourceType, Visibility } from './common.models';

export interface SearchResult {
  resource_type: ResourceType;
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  visibility: Visibility;
  owner_id: string;
  updated_at: string;
  rank: number;
}

export interface SearchOptions {
  types?: ResourceType[];
  limit?: number;
  offset?: number;
}

export const SEARCH_MIN_LENGTH = 2;

export type SearchState =
  | { status: 'idle'; term: string; results: [] }
  | { status: 'loading'; term: string; results: [] }
  | { status: 'success'; term: string; results: SearchResult[] }
  | { status: 'error'; term: string; results: []; message: string };
