import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BaseResourceInput,
  RESOURCE_LIMITS,
  Visibility,
  VISIBILITY_OPTIONS,
} from '../../core/models';
import { TagInput } from './tag-input';
import { TextField } from './text-field';
import { notBlank } from './validators';

/** Controles comunes a scripts, lecciones, notas y manuales. */
export interface BaseResourceControls {
  title: FormControl<string>;
  description: FormControl<string>;
  tags: FormControl<string[]>;
  visibility: FormControl<Visibility>;
}

/** Crea los controles comunes con las mismas reglas que los CHECK de la BD. */
export function createBaseResourceControls(): BaseResourceControls {
  return {
    title: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        notBlank,
        Validators.minLength(RESOURCE_LIMITS.titleMin),
        Validators.maxLength(RESOURCE_LIMITS.titleMax),
      ],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(RESOURCE_LIMITS.descriptionMax)],
    }),
    tags: new FormControl<string[]>([], { nonNullable: true }),
    visibility: new FormControl<Visibility>('private', { nonNullable: true }),
  };
}

/** Convierte los valores del formulario al payload común (textos recortados, vacío → null). */
export function toBaseResourceInput(value: {
  title: string;
  description: string;
  tags: string[];
  visibility: Visibility;
}): Required<BaseResourceInput> {
  return {
    title: value.title.trim(),
    description: value.description.trim() || null,
    tags: value.tags,
    visibility: value.visibility,
  };
}

/** Bloque de formulario: título, descripción, etiquetas y visibilidad. */
@Component({
  selector: 'app-resource-base-fields',
  imports: [ReactiveFormsModule, TextField, TagInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      <app-text-field
        label="Título"
        [fieldId]="idPrefix() + '-title'"
        [maxlength]="limits.titleMax"
        [control]="controls().title"
      />
      <app-text-field
        label="Descripción"
        type="textarea"
        [rows]="2"
        [optional]="true"
        [fieldId]="idPrefix() + '-description'"
        [maxlength]="limits.descriptionMax"
        hint="Resumen breve que aparece en los listados y en la búsqueda."
        [control]="controls().description"
      />
      <div>
        <label [for]="idPrefix() + '-tags'" class="label">
          Etiquetas
          <span class="ms-1 font-normal text-slate-500 dark:text-slate-400">(opcional)</span>
        </label>
        <div class="mt-1">
          <app-tag-input [inputId]="idPrefix() + '-tags'" [formControl]="controls().tags" />
        </div>
      </div>
      <fieldset>
        <legend class="label">Visibilidad</legend>
        <div class="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
          @for (option of visibilityOptions; track option.value) {
            <label class="flex items-center gap-2 text-sm">
              <input
                type="radio"
                class="size-4 accent-indigo-600"
                [value]="option.value"
                [formControl]="controls().visibility"
              />
              {{ option.label }}
            </label>
          }
        </div>
      </fieldset>
    </div>
  `,
})
export class ResourceBaseFields {
  readonly controls = input.required<BaseResourceControls>();
  readonly idPrefix = input.required<string>();
  protected readonly limits = RESOURCE_LIMITS;
  protected readonly visibilityOptions = VISIBILITY_OPTIONS;
}
