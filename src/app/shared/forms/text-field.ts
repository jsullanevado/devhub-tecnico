import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Icon } from '../ui/icon/icon';
import { controlErrorMessage, ErrorMessages, trackControlErrors } from './form-errors';

/**
 * Campo de texto accesible (input o textarea): etiqueta, ayuda, error asociado
 * (aria-describedby, aria-invalid) y botón mostrar/ocultar para contraseñas.
 * El error se muestra al abandonar el campo o al intentar enviar el formulario.
 */
@Component({
  selector: 'app-text-field',
  imports: [ReactiveFormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [for]="fieldId()" class="label">
      {{ label() }}
      @if (optional()) {
        <span class="ms-1 font-normal text-slate-500 dark:text-slate-400">(opcional)</span>
      }
    </label>
    <div class="relative mt-1">
      @if (type() === 'textarea') {
        <textarea
          class="input"
          [id]="fieldId()"
          [rows]="rows()"
          [formControl]="control()"
          [attr.placeholder]="placeholder() || null"
          [attr.maxlength]="maxlength() ?? null"
          [attr.aria-invalid]="errorMessage() ? 'true' : null"
          [attr.aria-describedby]="describedBy()"
        ></textarea>
      } @else {
        <input
          class="input"
          [class.pe-10]="type() === 'password'"
          [id]="fieldId()"
          [type]="inputType()"
          [formControl]="control()"
          [attr.autocomplete]="autocomplete()"
          [attr.placeholder]="placeholder() || null"
          [attr.maxlength]="maxlength() ?? null"
          [attr.aria-invalid]="errorMessage() ? 'true' : null"
          [attr.aria-describedby]="describedBy()"
          spellcheck="false"
        />
      }
      @if (type() === 'password') {
        <button
          type="button"
          class="absolute inset-y-0 end-0 flex items-center rounded-e-md px-3 text-slate-500 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-400 dark:hover:text-slate-200"
          (click)="revealed.set(!revealed())"
          [attr.aria-label]="revealed() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
          [attr.aria-pressed]="revealed()"
        >
          <app-icon [name]="revealed() ? 'eye-off' : 'eye'" iconClass="size-4" />
        </button>
      }
    </div>
    @if (errorMessage(); as message) {
      <p [id]="fieldId() + '-error'" class="mt-1 text-sm text-red-600 dark:text-red-400">
        {{ message }}
      </p>
    } @else if (hint()) {
      <p [id]="fieldId() + '-hint'" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {{ hint() }}
      </p>
    }
  `,
})
export class TextField {
  readonly label = input.required<string>();
  readonly fieldId = input.required<string>();
  readonly control = input.required<FormControl<string>>();
  readonly type = input<'text' | 'email' | 'password' | 'date' | 'textarea'>('text');
  readonly autocomplete = input('off');
  readonly placeholder = input('');
  readonly hint = input('');
  readonly optional = input(false);
  readonly maxlength = input<number>();
  readonly rows = input(3);
  readonly messages = input<ErrorMessages>({});

  protected readonly revealed = signal(false);
  protected readonly inputType = computed(() =>
    this.type() === 'password' && this.revealed() ? 'text' : this.type(),
  );

  private readonly visibleErrors = trackControlErrors(this.control);
  protected readonly errorMessage = computed(() =>
    controlErrorMessage(this.visibleErrors(), this.messages()),
  );
  protected readonly describedBy = computed(() => {
    if (this.errorMessage()) {
      return `${this.fieldId()}-error`;
    }
    return this.hint() ? `${this.fieldId()}-hint` : null;
  });
}
