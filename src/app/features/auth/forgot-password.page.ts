import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { toAppError } from '../../core/errors/error-mapper';
import { APP_PATHS } from '../../core/routing/app-paths';
import { TextField } from '../../shared/forms/text-field';
import { Alert } from '../../shared/ui/alert/alert';
import { Spinner } from '../../shared/ui/spinner/spinner';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, TextField, Alert, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-xl font-semibold">Recuperar contraseña</h1>
    <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
      Te enviaremos un enlace para crear una contraseña nueva.
    </p>

    @if (sent()) {
      <!-- Mensaje neutro: no revela si el correo está registrado. -->
      <app-alert type="success" class="mt-6">
        Si existe una cuenta con ese correo, recibirás un enlace en unos minutos. Ábrelo en este
        mismo navegador.
      </app-alert>
    } @else {
      @if (error(); as message) {
        <app-alert type="error" class="mt-4">{{ message }}</app-alert>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-4" novalidate>
        <app-text-field
          label="Correo electrónico"
          fieldId="forgot-email"
          type="email"
          autocomplete="email"
          [control]="form.controls.email"
        />
        <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
          @if (loading()) {
            <app-spinner size="sm" label="Enviando…" />
          }
          Enviar enlace
        </button>
      </form>
    }

    <p class="mt-6 text-center text-sm">
      <a [routerLink]="paths.login" class="link">Volver a iniciar sesión</a>
    </p>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly paths = APP_PATHS;
  protected readonly loading = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
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
      await this.auth.requestPasswordReset(this.form.getRawValue().email);
      this.sent.set(true);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
