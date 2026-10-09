import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { sanitizeRedirect } from '../../core/auth/auth.guards';
import { AuthService } from '../../core/auth/auth.service';
import { toAppError } from '../../core/errors/error-mapper';
import { APP_PATHS } from '../../core/routing/app-paths';
import { TextField } from '../../shared/forms/text-field';
import { Alert } from '../../shared/ui/alert/alert';
import { Spinner } from '../../shared/ui/spinner/spinner';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, TextField, Alert, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-xl font-semibold">Iniciar sesión</h1>
    <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
      Accede a la base de conocimiento de tu equipo.
    </p>

    @if (error(); as message) {
      <app-alert type="error" class="mt-4">{{ message }}</app-alert>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
      <app-text-field
        label="Correo electrónico"
        fieldId="login-email"
        type="email"
        autocomplete="email"
        [control]="form.controls.email"
      />
      <app-text-field
        label="Contraseña"
        fieldId="login-password"
        type="password"
        autocomplete="current-password"
        [control]="form.controls.password"
      />
      <div class="flex justify-end">
        <a [routerLink]="paths.forgotPassword" class="link text-sm">¿Olvidaste tu contraseña?</a>
      </div>
      <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
        @if (loading()) {
          <app-spinner size="sm" label="Iniciando sesión…" />
        }
        Entrar
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
      ¿No tienes cuenta?
      <a [routerLink]="paths.register" class="link">Regístrate</a>
    </p>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly paths = APP_PATHS;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

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
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email, password);
      const redirect = sanitizeRedirect(this.route.snapshot.queryParamMap.get('redirect'));
      await this.router.navigateByUrl(redirect);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
