import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PASSWORD_MIN_LENGTH } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { toAppError } from '../../core/errors/error-mapper';
import { PROFILE_LIMITS, USERNAME_PATTERN } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { APP_PATHS } from '../../core/routing/app-paths';
import { TextField } from '../../shared/forms/text-field';
import { matchesControl, notBlank } from '../../shared/forms/validators';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { Spinner } from '../../shared/ui/spinner/spinner';

/** Límite de bcrypt usado por Supabase Auth. */
const PASSWORD_MAX_LENGTH = 72;

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, TextField, Alert, Spinner, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sentTo(); as email) {
      <div class="text-center">
        <span
          class="mx-auto flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
        >
          <app-icon name="mail" iconClass="size-6" />
        </span>
        <h1 class="mt-4 text-xl font-semibold">Revisa tu correo</h1>
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Si la dirección <strong class="break-all">{{ email }}</strong> puede registrarse,
          recibirás un enlace para confirmar la cuenta. Ábrelo en este mismo navegador.
        </p>
        <a [routerLink]="paths.login" class="btn btn-secondary mt-6 w-full">Ir a iniciar sesión</a>
      </div>
    } @else {
      <h1 class="text-xl font-semibold">Crear cuenta</h1>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Únete al espacio de conocimiento técnico del equipo.
      </p>

      @if (error(); as message) {
        <app-alert type="error" class="mt-4">{{ message }}</app-alert>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
        <app-text-field
          label="Nombre completo"
          fieldId="register-full-name"
          autocomplete="name"
          [optional]="true"
          [maxlength]="limits.fullNameMax"
          [control]="form.controls.fullName"
        />
        <app-text-field
          label="Nombre de usuario"
          fieldId="register-username"
          autocomplete="username"
          [optional]="true"
          hint="3-30 caracteres: letras, números, punto, guion o guion bajo."
          [messages]="{
            pattern: 'Usa 3-30 caracteres: letras, números, punto, guion o guion bajo.',
          }"
          [control]="form.controls.username"
        />
        <app-text-field
          label="Correo electrónico"
          fieldId="register-email"
          type="email"
          autocomplete="email"
          [control]="form.controls.email"
        />
        <app-text-field
          label="Contraseña"
          fieldId="register-password"
          type="password"
          autocomplete="new-password"
          [hint]="'Mínimo ' + passwordMin + ' caracteres. Evita contraseñas reutilizadas.'"
          [control]="form.controls.password"
        />
        <app-text-field
          label="Confirmar contraseña"
          fieldId="register-confirm-password"
          type="password"
          autocomplete="new-password"
          [messages]="{ mismatch: 'Las contraseñas no coinciden.' }"
          [control]="form.controls.confirmPassword"
        />
        <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
          @if (loading()) {
            <app-spinner size="sm" label="Creando cuenta…" />
          }
          Crear cuenta
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        ¿Ya tienes cuenta?
        <a [routerLink]="paths.login" class="link">Inicia sesión</a>
      </p>
    }
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  protected readonly paths = APP_PATHS;
  protected readonly limits = PROFILE_LIMITS;
  protected readonly passwordMin = PASSWORD_MIN_LENGTH;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sentTo = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    fullName: ['', [Validators.maxLength(PROFILE_LIMITS.fullNameMax)]],
    username: ['', [Validators.pattern(USERNAME_PATTERN)]],
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [
        Validators.required,
        notBlank,
        Validators.minLength(PASSWORD_MIN_LENGTH),
        Validators.maxLength(PASSWORD_MAX_LENGTH),
      ],
    ],
    confirmPassword: ['', [Validators.required, matchesControl('password')]],
  });

  constructor() {
    // Revalida la confirmación cuando cambia la contraseña.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
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
      const { email, password, username, fullName } = this.form.getRawValue();
      const result = await this.auth.signUp({ email, password, username, fullName });
      if (result.needsEmailConfirmation) {
        this.sentTo.set(email.trim());
      } else {
        this.notifications.success('Cuenta creada. ¡Bienvenido a DevHub Técnico!');
        await this.router.navigateByUrl(APP_PATHS.home);
      }
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
