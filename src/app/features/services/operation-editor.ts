import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { COMMON_MEDIA_TYPES, HTTP_METHODS, SERVICE_LIMITS, bodyLanguage } from '../../core/models';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { Icon } from '../../shared/ui/icon/icon';
import { formatXml } from '../tools/lib/xml';
import { KeyValueEditor } from './key-value-editor';
import { OperationGroup } from './service-form.model';

/** Formatea un body JSON o XML; devuelve null si no se reconoce o no es válido. */
function formatBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith('<')) {
    const result = formatXml(trimmed);
    return result.ok ? result.output : null;
  }
  return null;
}

/** Edición de una operación de un servicio dentro del formulario. */
@Component({
  selector: 'app-operation-editor',
  imports: [ReactiveFormsModule, CodeEditor, KeyValueEditor, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let op = group();
    @let prefix = 'op-' + index();
    <fieldset class="card p-5" [formGroup]="op" [attr.aria-label]="'Operación ' + (index() + 1)">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="me-auto font-semibold">
          Operación {{ index() + 1 }}{{ name() ? ': ' + name() : '' }}
        </h3>
        <button
          type="button"
          class="btn-icon"
          aria-label="Subir operación"
          [disabled]="index() === 0"
          (click)="moveUp.emit()"
        >
          <app-icon name="arrow-up" iconClass="size-4" />
        </button>
        <button
          type="button"
          class="btn-icon"
          aria-label="Bajar operación"
          [disabled]="index() === total() - 1"
          (click)="moveDown.emit()"
        >
          <app-icon name="arrow-down" iconClass="size-4" />
        </button>
        <button
          type="button"
          class="btn-icon"
          aria-label="Duplicar operación"
          (click)="duplicate.emit()"
        >
          <app-icon name="copy" iconClass="size-4" />
        </button>
        <button
          type="button"
          class="btn-icon text-red-600 dark:text-red-400"
          aria-label="Eliminar operación"
          (click)="remove.emit()"
        >
          <app-icon name="trash" iconClass="size-4" />
        </button>
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div>
          <label class="label" [for]="prefix + '-name'">Nombre de la operación</label>
          <input
            class="input mt-1"
            [id]="prefix + '-name'"
            formControlName="name"
            placeholder="ejecutaAccionMovil"
            [maxlength]="limits.operationNameMax"
            [attr.aria-invalid]="nameInvalid() ? 'true' : null"
          />
          @if (nameInvalid()) {
            <p class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
              El nombre es obligatorio.
            </p>
          }
        </div>
        <div>
          <label class="label" [for]="prefix + '-method'">Método</label>
          <select class="input mt-1 font-mono" [id]="prefix + '-method'" formControlName="method">
            @for (method of methods; track method) {
              <option [value]="method">{{ method }}</option>
            }
          </select>
        </div>
      </div>

      <div class="mt-4">
        <label class="label" [for]="prefix + '-path'">Recurso (ruta tras la URL base)</label>
        <input
          class="input mt-1 font-mono"
          [id]="prefix + '-path'"
          formControlName="path"
          placeholder="/v1.0/MIG1_postventa/service_Domain/svcProblem/..."
          [maxlength]="limits.pathMax"
          spellcheck="false"
        />
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        @if (protocol() === 'soap') {
          <div>
            <label class="label" [for]="prefix + '-soap-action'">SOAPAction</label>
            <input
              class="input mt-1 font-mono"
              [id]="prefix + '-soap-action'"
              formControlName="soap_action"
              placeholder="urn:consultarCliente"
              [maxlength]="limits.soapActionMax"
              spellcheck="false"
            />
          </div>
        }
        <div>
          <label class="label" [for]="prefix + '-media'">Media type</label>
          <input
            class="input mt-1 font-mono"
            [id]="prefix + '-media'"
            formControlName="media_type"
            [attr.list]="prefix + '-media-options'"
            [placeholder]="protocol() === 'soap' ? 'text/xml; charset=utf-8' : 'application/json'"
            [maxlength]="limits.mediaTypeMax"
            spellcheck="false"
          />
          <datalist [id]="prefix + '-media-options'">
            @for (type of mediaTypes; track type) {
              <option [value]="type"></option>
            }
          </datalist>
        </div>
      </div>

      <div class="mt-5 grid gap-5 lg:grid-cols-2">
        <app-key-value-editor
          [array]="op.controls.headers"
          label="Headers"
          itemLabel="header"
          namePlaceholder="Authorization"
        />
        <app-key-value-editor
          [array]="op.controls.query_params"
          label="Query params"
          itemLabel="parámetro"
          namePlaceholder="idTransaccion"
        />
      </div>

      <div class="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <div class="flex items-center justify-between gap-2">
            <span class="label" [id]="prefix + '-request-label'">Request (body)</span>
            <button type="button" class="link text-sm" (click)="format(op.controls.request_body)">
              Formatear
            </button>
          </div>
          <app-code-editor
            class="mt-1"
            formControlName="request_body"
            [language]="language()"
            [ariaLabel]="'Request de la operación ' + (index() + 1)"
          />
        </div>
        <div>
          <div class="flex items-center justify-between gap-2">
            <span class="label">Response de ejemplo</span>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                HTTP
                <input
                  type="number"
                  class="input w-20 py-1"
                  formControlName="response_status"
                  min="100"
                  max="599"
                  placeholder="200"
                  [attr.aria-label]="'Código HTTP de la response ' + (index() + 1)"
                />
              </label>
              <button
                type="button"
                class="link text-sm"
                (click)="format(op.controls.response_body)"
              >
                Formatear
              </button>
            </div>
          </div>
          <app-code-editor
            class="mt-1"
            formControlName="response_body"
            [language]="language()"
            [ariaLabel]="'Response de la operación ' + (index() + 1)"
          />
        </div>
      </div>
      @if (formatError(); as message) {
        <p class="mt-2 text-sm text-amber-700 dark:text-amber-300" role="status">{{ message }}</p>
      }

      <div class="mt-5">
        <label class="label" [for]="prefix + '-notes'">Notas de la operación (opcional)</label>
        <textarea
          class="input mt-1"
          [id]="prefix + '-notes'"
          formControlName="notes"
          rows="2"
          [maxlength]="limits.operationNotesMax"
          placeholder="Códigos de error, flujo, dependencias…"
        ></textarea>
      </div>
    </fieldset>
  `,
})
export class OperationEditor {
  readonly group = input.required<OperationGroup>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();
  readonly protocol = input.required<string>();

  readonly remove = output<void>();
  readonly duplicate = output<void>();
  readonly moveUp = output<void>();
  readonly moveDown = output<void>();

  protected readonly methods = HTTP_METHODS;
  protected readonly mediaTypes = COMMON_MEDIA_TYPES;
  protected readonly limits = SERVICE_LIMITS;
  protected readonly formatError = signal<string | null>(null);

  /**
   * Contador que cambia con cada evento del grupo (valor, estado, touched…): las
   * señales derivadas se recalculan aunque el cambio venga del formulario padre
   * (p. ej. markAllAsTouched al enviar), algo que OnPush no detectaría solo.
   */
  private readonly changes = signal(0);
  protected readonly name = computed(() => {
    this.changes();
    return this.group().controls.name.value.trim();
  });
  protected readonly language = computed(() => {
    this.changes();
    return bodyLanguage(this.group().controls.media_type.value, this.protocol());
  });
  protected readonly nameInvalid = computed(() => {
    this.changes();
    const control = this.group().controls.name;
    return control.invalid && control.touched;
  });

  constructor() {
    effect((onCleanup) => {
      const subscription = this.group().events.subscribe(() =>
        this.changes.update((count) => count + 1),
      );
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected format(control: FormControl<string>): void {
    if (!control.value.trim()) {
      return;
    }
    const formatted = formatBody(control.value);
    if (formatted === null) {
      this.formatError.set('No se pudo formatear: el contenido no es JSON ni XML válido.');
      return;
    }
    this.formatError.set(null);
    control.setValue(formatted);
    control.markAsDirty();
  }
}
