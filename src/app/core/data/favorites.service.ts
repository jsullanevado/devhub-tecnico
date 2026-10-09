import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../errors/app-error';
import { DEFAULT_ERROR_MESSAGES, toAppError } from '../errors/error-mapper';
import { FavoriteItem, FavoriteResourceSummary, ResourceType } from '../models';
import { Database } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase.client';

type FavoriteInsert = Database['public']['Tables']['user_favorites']['Insert'];
type FavoriteColumn = 'script_id' | 'lesson_id' | 'note_id' | 'manual_id';

const FAVORITE_COLUMN = {
  script: 'script_id',
  lesson: 'lesson_id',
  note: 'note_id',
  manual: 'manual_id',
} as const satisfies Record<ResourceType, FavoriteColumn>;

// Literal único: supabase-js deduce el tipo de cada fila a partir del texto del select.
const FAVORITE_SELECT =
  'id, created_at, resource_type, script_id, lesson_id, note_id, manual_id, script:scripts(id, title, description, visibility, updated_at), lesson:lessons_learned(id, title, description, visibility, updated_at), note:notes(id, title, description, visibility, updated_at), manual:manuals(id, title, description, visibility, updated_at)';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  /** Favoritos del usuario actual (RLS ya limita a los propios). */
  async list(): Promise<FavoriteItem[]> {
    const { data, error } = await this.supabase
      .from('user_favorites')
      .select(FAVORITE_SELECT)
      .order('created_at', { ascending: false });
    if (error) {
      throw toAppError(error);
    }
    return (data ?? []).map((row) => {
      const type = row.resource_type as ResourceType;
      const resource = row.script ?? row.lesson ?? row.note ?? row.manual;
      return {
        id: row.id,
        resource_type: type,
        resource_id: row[FAVORITE_COLUMN[type]] ?? '',
        created_at: row.created_at,
        resource: (resource as FavoriteResourceSummary | null) ?? null,
      };
    });
  }

  /** Ids favoritos agrupados por tipo (una sola consulta ligera, sin incrustar recursos). */
  async allIds(): Promise<Record<ResourceType, Set<string>>> {
    const { data, error } = await this.supabase
      .from('user_favorites')
      .select('script_id, lesson_id, note_id, manual_id');
    if (error) {
      throw toAppError(error);
    }
    const ids: Record<ResourceType, Set<string>> = {
      script: new Set(),
      lesson: new Set(),
      note: new Set(),
      manual: new Set(),
    };
    for (const row of data ?? []) {
      for (const type of Object.keys(FAVORITE_COLUMN) as ResourceType[]) {
        const id = row[FAVORITE_COLUMN[type]];
        if (id) {
          ids[type].add(id);
        }
      }
    }
    return ids;
  }

  /** Idempotente: marcar un favorito ya existente no es un error. */
  async add(type: ResourceType, resourceId: string): Promise<void> {
    this.requireUserId();
    const payload: FavoriteInsert = {};
    payload[FAVORITE_COLUMN[type]] = resourceId;
    const { error } = await this.supabase.from('user_favorites').insert(payload);
    if (error && error.code !== '23505') {
      throw toAppError(error);
    }
  }

  async remove(type: ResourceType, resourceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', this.requireUserId())
      .eq(FAVORITE_COLUMN[type], resourceId);
    if (error) {
      throw toAppError(error);
    }
  }

  private requireUserId(): string {
    const userId = this.auth.userId();
    if (!userId) {
      throw new AppError('unauthenticated', DEFAULT_ERROR_MESSAGES.unauthenticated);
    }
    return userId;
  }
}
