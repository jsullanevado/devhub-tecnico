import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { SERVICE_LIMITS } from '../../core/models';
import { Icon } from '../../shared/ui/icon/icon';
import { createPairGroup, PairGroup } from './service-form.model';

/** Lista editable de pares nombre/valor (headers, query params). */
@Component({
  selector: 'app-key-value-editor',
  imports: [ReactiveFormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <fieldset [disabled]="array().disabled">
      <legend class="label">{{ label() }}</legend>
      @if (array().length > 0) {
        <ul class="mt-1 space-y-2">
          @for (pair of array().controls; track pair; let index = $index) {
            <li class="flex items-center gap-2" [formGroup]="pair">
              <input
                class="input w-2/5 font-mono"
                formControlName="name"
                [attr.aria-label]="label() + ' ' + (index + 1) + ': nombre'"
                [placeholder]="namePlaceholder()"
                [maxlength]="limits.pairNameMax"
                autocomplete="off"
                spellcheck="false"
              />
              <input
                class="input flex-1 font-mono"
                formControlName="value"
                [attr.aria-label]="label() + ' ' + (index + 1) + ': valor'"
                placeholder="Valor"
                [maxlength]="limits.pairValueMax"
                autocomplete="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="btn-icon"
                [attr.aria-label]="'Quitar ' + label().toLowerCase() + ' ' + (index + 1)"
                (click)="remove(index)"
              >
                <app-icon name="x" iconClass="size-4" />
              </button>
            </li>
          }
        </ul>
      }
      @if (array().length < limits.pairsMax) {
        <button
          type="button"
          class="link mt-2 inline-flex items-center gap-1 text-sm"
          (click)="add()"
        >
          <app-icon name="plus" iconClass="size-4" /> Añadir {{ itemLabel() }}
        </button>
      }
    </fieldset>
  `,
})
export class KeyValueEditor {
  readonly array = input.required<FormArray<PairGroup>>();
  readonly label = input.required<string>();
  readonly itemLabel = input('fila');
  readonly namePlaceholder = input('Nombre');

  protected readonly limits = SERVICE_LIMITS;

  protected add(): void {
    this.array().push(createPairGroup());
    this.array().markAsDirty();
  }

  protected remove(index: number): void {
    this.array().removeAt(index);
    this.array().markAsDirty();
  }
}
