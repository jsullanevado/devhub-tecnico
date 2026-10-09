import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { controlErrorMessage, trackControlErrors } from './form-errors';

export interface SelectOption<T> {
  readonly value: T;
  readonly label: string;
}

@Component({
  selector: 'app-select-field',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [for]="fieldId()" class="label">{{ label() }}</label>
    <select
      class="input mt-1"
      [id]="fieldId()"
      [formControl]="control()"
      [attr.aria-invalid]="errorMessage() ? 'true' : null"
      [attr.aria-describedby]="errorMessage() ? fieldId() + '-error' : null"
    >
      @for (option of options(); track option.value) {
        <option [ngValue]="option.value">{{ option.label }}</option>
      }
    </select>
    @if (errorMessage(); as message) {
      <p [id]="fieldId() + '-error'" class="mt-1 text-sm text-red-600 dark:text-red-400">
        {{ message }}
      </p>
    }
  `,
})
export class SelectField<T> {
  readonly label = input.required<string>();
  readonly fieldId = input.required<string>();
  readonly control = input.required<FormControl<T>>();
  readonly options = input.required<readonly SelectOption<T>[]>();

  private readonly visibleErrors = trackControlErrors(this.control);
  protected readonly errorMessage = computed(() => controlErrorMessage(this.visibleErrors()));
}
