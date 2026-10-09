/** Debe coincidir con Authentication → Providers → Email → "Minimum password length". */
export const PASSWORD_MIN_LENGTH = 8;

export interface SignUpData {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
}

export interface SignUpResult {
  /** true si Supabase exige confirmar el correo antes de iniciar sesión. */
  needsEmailConfirmation: boolean;
}
