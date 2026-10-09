import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith, switchMap } from 'rxjs';
import { controlErrorMessage, ErrorMessages, trackControlErrors } from '../forms/form-errors';
import { Markdown } from './markdown';

/** Área de texto Markdown con pestañas Escribir / Vista previa. */
@Component({
  selector: 'app-markdown-field',
  imports: [ReactiveFormsModule, Markdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-end justify-between gap-2">
      <label [for]="fieldId()" class="label">
        {{ label() }}
        @if (optional()) {
          <span class="ms-1 font-normal text-slate-500 dark:text-slate-400">(opcional)</span>
        }
      </label>
      <div class="flex gap-1 text-xs" role="group" [attr.aria-label]="'Modo de ' + label()">
        <button
          type="button"
          class="rounded px-2 py-1 aria-pressed:bg-slate-200 dark:aria-pressed:bg-slate-700"
          [attr.aria-pressed]="!preview()"
          (click)="preview.set(false)"
        >
          Escribir
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 aria-pressed:bg-slate-200 dark:aria-pressed:bg-slate-700"
          [attr.aria-pressed]="preview()"
          (click)="preview.set(true)"
        >
          Vista previa
        </button>
      </div>
    </div>

    <div class="mt-1">
      <textarea
        class="input font-mono"
        [class.hidden]="preview()"
        [id]="fieldId()"
        [rows]="rows()"
        [formControl]="control()"
        [attr.maxlength]="maxlength() ?? null"
        [attr.aria-invalid]="errorMessage() ? 'true' : null"
        [attr.aria-describedby]="fieldId() + (errorMessage() ? '-error' : '-hint')"
      ></textarea>
      @if (preview()) {
        <div class="card min-h-24 p-4">
          @if (value().trim()) {
            <app-markdown [content]="value()" />
          } @else {
            <p class="text-sm text-slate-500 dark:text-slate-400">Nada que previsualizar.</p>
          }
        </div>
      }
    </div>

    @if (errorMessage(); as message) {
      <p [id]="fieldId() + '-error'" class="mt-1 text-sm text-red-600 dark:text-red-400">
        {{ message }}
      </p>
    } @else {
      <p [id]="fieldId() + '-hint'" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {{
          hint() || 'Admite Markdown: # títulos, **negrita**, listas, enlaces y bloques de código.'
        }}
      </p>
    }
  `,
})
export class MarkdownField {
  readonly label = input.required<string>();
  readonly fieldId = input.required<string>();
  readonly control = input.required<FormControl<string>>();
  readonly rows = input(8);
  readonly optional = input(false);
  readonly maxlength = input<number>();
  readonly hint = input('');
  readonly messages = input<ErrorMessages>({});

  protected readonly preview = signal(false);
  protected readonly value = toSignal(
    toObservable(this.control).pipe(
      switchMap((control) => control.valueChanges.pipe(startWith(control.value))),
    ),
    { initialValue: '' },
  );

  private readonly visibleErrors = trackControlErrors(this.control);
  protected readonly errorMessage = computed(() =>
    controlErrorMessage(this.visibleErrors(), this.messages()),
  );
}
