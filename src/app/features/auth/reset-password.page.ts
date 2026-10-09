import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PASSWORD_MIN_LENGTH } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { toAppError } from '../../core/errors/error-mapper';
import { NotificationService } from '../../core/notifications/notification.service';
import { APP_PATHS } from '../../core/routing/app-paths';
import { TextField } from '../../shared/forms/text-field';
import { matchesControl, notBlank } from '../../shared/forms/validators';
import { Alert } from '../../shared/ui/alert/alert';
import { Spinner } from '../../shared/ui/spinner/spinner';

type ResetState = 'checking' | 'ready' | 'invalid';

/**
 * Destino del enlace de recuperación. Supabase canjea el código de la URL y abre
 * una sesión temporal; sin sesión, el enlace es inválido o ha caducado.
 */
@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, TextField, Alert, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-xl font-semibold">Nueva contraseña</h1>

    @switch (state()) {
      @case ('checking') {
        <div class="flex items-center gap-3 py-8 text-sm text-slate-600 dark:text-slate-400">
          <app-spinner size="sm" label="" /> Verificando el enlace…
        </div>
      }
      @case ('invalid') {
        <app-alert type="error" class="mt-4">{{ linkError() }}</app-alert>
        <a [routerLink]="paths.forgotPassword" class="btn btn-primary mt-6 w-full">
          Solicitar un enlace nuevo
        </a>
      }
      @case ('ready') {
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Elige una contraseña nueva para tu cuenta.
        </p>
        @if (error(); as message) {
          <app-alert type="error" class="mt-4">{{ message }}</app-alert>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
          <app-text-field
            label="Contraseña nueva"
            fieldId="reset-password"
            type="password"
            autocomplete="new-password"
            [hint]="'Mínimo ' + passwordMin + ' caracteres.'"
            [control]="form.controls.password"
          />
          <app-text-field
            label="Confirmar contraseña"
            fieldId="reset-confirm-password"
            type="password"
            autocomplete="new-password"
            [messages]="{ mismatch: 'Las contraseñas no coinciden.' }"
            [control]="form.controls.confirmPassword"
          />
          <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
            @if (loading()) {
              <app-spinner size="sm" label="Guardando…" />
            }
            Guardar contraseña
          </button>
        </form>
      }
    }
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);

  protected readonly paths = APP_PATHS;
  protected readonly passwordMin = PASSWORD_MIN_LENGTH;
  protected readonly state = signal<ResetState>('checking');
  protected readonly linkError = signal('El enlace no es válido o ha caducado.');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    password: [
      '',
      [
        Validators.required,
        notBlank,
        Validators.minLength(PASSWORD_MIN_LENGTH),
        Validators.maxLength(72),
      ],
    ],
    confirmPassword: ['', [Validators.required, matchesControl('password')]],
  });

  constructor() {
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
    void this.verifyLink();
  }

  protected async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.updatePassword(this.form.getRawValue().password);
      this.notifications.success('Contraseña actualizada correctamente.');
      await this.router.navigateByUrl(APP_PATHS.home);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async verifyLink(): Promise<void> {
    const errorCode = this.readLinkErrorCode();
    await this.auth.whenReady();

    if (errorCode) {
      // Solo mensajes propios: el texto de la URL podría estar manipulado.
      this.linkError.set(
        errorCode === 'otp_expired'
          ? 'El enlace ha caducado o ya fue utilizado. Solicita uno nuevo.'
          : 'El enlace no es válido o ha caducado.',
      );
      this.state.set('invalid');
      return;
    }
    this.state.set(this.auth.isAuthenticated() ? 'ready' : 'invalid');
  }

  /** Supabase informa los errores del enlace en la query o en el fragmento (#). */
  private readLinkErrorCode(): string | null {
    const query = this.route.snapshot.queryParamMap;
    const fragment = new URLSearchParams(this.route.snapshot.fragment ?? '');
    const code = query.get('error_code') ?? fragment.get('error_code');
    const hasError = code ?? query.get('error') ?? fragment.get('error');
    return hasError ? (code ?? 'unknown') : null;
  }
}
