import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import { DEFAULT_ERROR_MESSAGES, toAppError } from '../errors/error-mapper';
import { Profile, ProfileUpdate } from '../models';
import { ProfileService } from '../data/profile.service';
import { APP_PATHS } from '../routing/app-paths';
import { SUPABASE } from '../supabase/supabase.client';
import { SignUpData, SignUpResult } from './auth.models';

/**
 * Única fuente de verdad de la sesión. Escucha Supabase Auth (incluidas otras
 * pestañas y la renovación automática del token) y expone el estado como signals.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);
  private readonly router = inject(Router);
  private readonly profiles = inject(ProfileService);

  private readonly _session = signal<Session | null>(null);
  private readonly _profile = signal<Profile | null>(null);
  private readonly _ready = signal(false);
  private readonly _recoveryMode = signal(false);
  private readonly readyPromise: Promise<void>;

  readonly session = this._session.asReadonly();
  readonly user = computed(() => this._session()?.user ?? null);
  readonly userId = computed(() => this.user()?.id ?? null);
  readonly email = computed(() => this.user()?.email ?? null);
  readonly profile = this._profile.asReadonly();
  readonly isAuthenticated = computed(() => this._session() !== null);
  /** Solo para la interfaz: los permisos reales los aplica RLS. */
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');
  /** true cuando ya se conoce la sesión inicial. */
  readonly ready = this._ready.asReadonly();
  /** true tras abrir el enlace de recuperación de contraseña. */
  readonly recoveryMode = this._recoveryMode.asReadonly();

  constructor() {
    this.readyPromise = new Promise<void>((resolve) => {
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.handleAuthEvent(event, session);
        if (event === 'INITIAL_SESSION') {
          resolve();
        }
      });
    });
  }

  /** Resuelve cuando Supabase ha restaurado (o descartado) la sesión guardada. */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw toAppError(error);
    }
  }

  async signUp(input: SignUpData): Promise<SignUpResult> {
    const { data, error } = await this.supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: this.absoluteUrl('/'),
        // Solo datos de perfil. El rol NUNCA se toma de aquí (ver handle_new_user).
        data: {
          username: input.username?.trim() || undefined,
          full_name: input.fullName?.trim() || undefined,
        },
      },
    });
    if (error) {
      throw toAppError(error);
    }
    return { needsEmailConfirmation: data.session === null };
  }

  /**
   * Cierra la sesión en este dispositivo; la redirección a login la gestiona el
   * evento SIGNED_OUT. `scope: 'global'` cerraría todas las sesiones del usuario.
   */
  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut({ scope: 'local' });
    if (error) {
      throw toAppError(error);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: this.absoluteUrl(APP_PATHS.resetPassword),
    });
    if (error) {
      throw toAppError(error);
    }
  }

  /** Requiere sesión activa (normal o de recuperación). */
  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw toAppError(error);
    }
    this._recoveryMode.set(false);
  }

  async updateProfile(changes: ProfileUpdate): Promise<Profile> {
    const userId = this.userId();
    if (!userId) {
      throw new AppError('unauthenticated', DEFAULT_ERROR_MESSAGES.unauthenticated);
    }
    const profile = await this.profiles.update(userId, changes);
    this._profile.set(profile);
    return profile;
  }

  async refreshProfile(): Promise<Profile | null> {
    const userId = this.userId();
    const profile = userId ? await this.profiles.getById(userId) : null;
    if (this.userId() === userId) {
      this._profile.set(profile);
    }
    return profile;
  }

  private handleAuthEvent(event: AuthChangeEvent, session: Session | null): void {
    this._session.set(session);

    switch (event) {
      case 'INITIAL_SESSION':
        this._ready.set(true);
        break;
      case 'PASSWORD_RECOVERY':
        this._recoveryMode.set(true);
        break;
      case 'SIGNED_OUT':
        this._profile.set(null);
        this._recoveryMode.set(false);
        if (!this.router.url.startsWith('/auth')) {
          void this.router.navigateByUrl(APP_PATHS.login);
        }
        return;
    }

    const userChanged = session !== null && this._profile()?.id !== session.user.id;
    if (session && (userChanged || event === 'USER_UPDATED')) {
      // Diferido: no se debe llamar a Supabase dentro del callback de onAuthStateChange
      // (bloquearía el lock interno de la sesión).
      setTimeout(() => void this.loadProfile(session.user.id), 0);
    }
  }

  private async loadProfile(userId: string): Promise<void> {
    try {
      const profile = await this.profiles.getById(userId);
      if (this.userId() === userId) {
        this._profile.set(profile);
      }
    } catch (error) {
      // No bloquea la sesión: la interfaz puede funcionar sin el perfil.
      console.warn('[DevHub] No se pudo cargar el perfil', toAppError(error));
    }
  }

  private absoluteUrl(path: string): string {
    return new URL(path, window.location.origin).toString();
  }
}
