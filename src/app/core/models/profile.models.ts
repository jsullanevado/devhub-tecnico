export type UserRole = 'user' | 'admin' | 'superadmin';

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** Solo lectura: se asigna desde SQL (ver Etapa 1). */
  role: UserRole;
  created_at: string;
  updated_at: string;
}

/** Únicos campos que el usuario puede modificar (GRANT por columna en la BD). */
export interface ProfileUpdate {
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;

export const PROFILE_LIMITS = {
  fullNameMax: 120,
  bioMax: 500,
  avatarUrlMax: 500,
} as const;
