import { Injectable, inject } from '@angular/core';
import { toAppError } from '../errors/error-mapper';
import { Profile, ProfileUpdate } from '../models';
import { SUPABASE } from '../supabase/supabase.client';

const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, bio, role, created_at, updated_at';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SUPABASE);

  async getById(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw toAppError(error);
    }
    return data as Profile | null;
  }

  /** RLS solo permite actualizar el propio perfil; role no es modificable. */
  async update(id: string, changes: ProfileUpdate): Promise<Profile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(changes)
      .eq('id', id)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) {
      throw toAppError(error);
    }
    return data as Profile;
  }
}
