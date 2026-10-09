import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { normalizeTags, RESOURCE_LIMITS, TAG_PATTERN } from '../../core/models';
import { Icon } from '../ui/icon/icon';

/**
 * Editor de etiquetas (chips). Enter o coma añade; Retroceso con el campo vacío
 * quita la última. Normaliza y valida igual que la base de datos.
 */
@Component({
  selector: 'app-tag-input',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TagInput), multi: true }],
  template: `
    <div
      class="input flex min-h-[2.375rem] flex-wrap items-center gap-1.5 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30"
      [class.opacity-60]="disabled()"
      (click)="field.focus()"
    >
      @for (tag of tags(); track tag) {
        <span
          class="badge gap-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
        >
          {{ tag }}
          <button
            type="button"
            class="-me-1 rounded-full p-0.5 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-indigo-500/20"
            [disabled]="disabled()"
            (click)="remove(tag); $event.stopPropagation()"
            [attr.aria-label]="'Quitar etiqueta ' + tag"
          >
            <app-icon name="x" iconClass="size-3" />
          </button>
        </span>
      }
      <input
        #field
        type="text"
        class="min-w-24 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-slate-400 focus:ring-0"
        [id]="inputId()"
        [placeholder]="tags().length ? '' : placeholder()"
        [disabled]="disabled()"
        [attr.aria-describedby]="error() ? inputId() + '-error' : null"
        [attr.aria-invalid]="error() ? 'true' : null"
        maxlength="40"
        autocomplete="off"
        spellcheck="false"
        (keydown)="onKeydown($event, field)"
        (blur)="commit(field); onTouched()"
      />
    </div>
    @if (error(); as message) {
      <p [id]="inputId() + '-error'" class="mt-1 text-sm text-red-600 dark:text-red-400">
        {{ message }}
      </p>
    }
  `,
})
export class TagInput implements ControlValueAccessor {
  readonly inputId = input.required<string>();
  readonly placeholder = input('Escribe y pulsa Enter');

  protected readonly tags = signal<string[]>([]);
  protected readonly disabled = signal(false);
  protected readonly error = signal<string | null>(null);

  private onChange: (value: string[]) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: string[] | null): void {
    this.tags.set(normalizeTags(value ?? []));
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onKeydown(event: KeyboardEvent, field: HTMLInputElement): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commit(field);
    } else if (event.key === 'Backspace' && field.value === '' && this.tags().length > 0) {
      this.remove(this.tags()[this.tags().length - 1]);
    }
  }

  protected commit(field: HTMLInputElement): void {
    const [candidate] = normalizeTags([field.value]);
    if (!candidate) {
      field.value = '';
      return;
    }
    if (!TAG_PATTERN.test(candidate)) {
      this.error.set('Etiqueta no válida: usa letras, números y . # + _ - (sin espacios).');
      return;
    }
    if (!this.tags().includes(candidate) && this.tags().length >= RESOURCE_LIMITS.tagsMax) {
      this.error.set(`Máximo ${RESOURCE_LIMITS.tagsMax} etiquetas.`);
      return;
    }
    field.value = '';
    this.update(normalizeTags([...this.tags(), candidate]));
  }

  protected remove(tag: string): void {
    this.update(this.tags().filter((item) => item !== tag));
  }

  private update(tags: string[]): void {
    this.error.set(null);
    this.tags.set(tags);
    this.onChange(tags);
  }
}
