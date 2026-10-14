import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import {
  DATABASE_OBJECT_LIMITS,
  DATABASE_OBJECT_TYPES,
  databaseObjectKey,
  databaseObjectTypeShort,
} from '../../core/models';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { Icon } from '../../shared/ui/icon/icon';
import { DatabaseObjectGroup, memberLines } from './database-object-form';
import { parseObjectCode } from './lib/object-parser';

/** Edición de un objeto de la conexión (package con sus SP, tabla, vista…). */
@Component({
  selector: 'app-database-object-editor',
  imports: [ReactiveFormsModule, CodeEditor, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let obj = group();
    @let prefix = 'obj-' + index();
    <details
      class="card group overflow-hidden"
      [open]="open() || nameInvalid()"
      [formGroup]="obj"
      [attr.aria-label]="'Objeto ' + (index() + 1)"
    >
      <summary
        class="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <span class="badge font-mono">{{ typeShort() }}</span>
        <span class="min-w-0 flex-1 truncate font-mono font-medium">
          {{ key() || 'Objeto ' + (index() + 1) }}
        </span>
        @if (memberCount()) {
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ memberCount() }} SP/FN</span>
        }
        <app-icon
          name="chevron-down"
          iconClass="size-4 transition-transform group-open:rotate-180"
        />
      </summary>

      <div class="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">
        <div class="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
          <div>
            <label class="label" [for]="prefix + '-type'">Tipo</label>
            <select class="input mt-1" [id]="prefix + '-type'" formControlName="type">
              @for (type of types; track type.value) {
                <option [value]="type.value">{{ type.label }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label" [for]="prefix + '-schema'">Esquema (opcional)</label>
            <input
              class="input mt-1 font-mono"
              [id]="prefix + '-schema'"
              formControlName="schema"
              placeholder="USRPROM"
              [maxlength]="limits.schemaMax"
              spellcheck="false"
            />
          </div>
          <div>
            <label class="label" [for]="prefix + '-name'">Nombre</label>
            <input
              class="input mt-1 font-mono"
              [id]="prefix + '-name'"
              formControlName="name"
              placeholder="PKG_CLIENTE"
              [maxlength]="limits.nameMax"
              spellcheck="false"
              [attr.aria-invalid]="nameInvalid() ? 'true' : null"
            />
            @if (nameInvalid()) {
              <p class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                El nombre es obligatorio.
              </p>
            }
          </div>
        </div>

        <div>
          <label class="label" [for]="prefix + '-description'">Descripción (opcional)</label>
          <input
            class="input mt-1"
            [id]="prefix + '-description'"
            formControlName="description"
            placeholder="Para qué sirve, quién lo usa…"
            [maxlength]="limits.descriptionMax"
          />
        </div>

        @if (hasMembers()) {
          <div>
            <label class="label" [for]="prefix + '-members'"
              >Procedimientos y funciones (uno por línea)</label
            >
            <textarea
              class="input mt-1 font-mono text-sm"
              [id]="prefix + '-members'"
              formControlName="members"
              rows="5"
              spellcheck="false"
              placeholder="SP_REGISTRAR_CLIENTE&#10;SP_ACTUALIZAR_ESTADO&#10;FN_OBTENER_SALDO"
            ></textarea>
          </div>
        }

        <div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="label">Código (DDL, spec / body) (opcional)</span>
            <button type="button" class="link text-sm" (click)="detect()">
              Detectar del código
            </button>
          </div>
          <app-code-editor
            class="mt-1"
            formControlName="code"
            language="sql"
            [ariaLabel]="'Código del objeto ' + (index() + 1)"
          />
          @if (detected(); as message) {
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-400" role="status">
              {{ message }}
            </p>
          }
        </div>

        <div class="flex justify-end">
          <button
            type="button"
            class="btn btn-secondary text-red-600 dark:text-red-400"
            (click)="remove.emit()"
          >
            <app-icon name="trash" iconClass="size-4" /> Quitar objeto
          </button>
        </div>
      </div>
    </details>
  `,
})
export class DatabaseObjectEditor {
  readonly group = input.required<DatabaseObjectGroup>();
  readonly index = input.required<number>();
  /** Abierto al crearse (objeto nuevo) o cerrado (ya guardado). */
  readonly open = input(false);

  readonly remove = output<void>();

  protected readonly types = DATABASE_OBJECT_TYPES;
  protected readonly limits = DATABASE_OBJECT_LIMITS;
  protected readonly detected = signal<string | null>(null);

  /** Cambia con cada evento del grupo: OnPush no ve los cambios que vienen del padre. */
  private readonly changes = signal(0);
  private readonly value = computed(() => {
    this.changes();
    return this.group().getRawValue();
  });
  protected readonly key = computed(() => {
    const value = this.value();
    return value.name.trim()
      ? databaseObjectKey({ schema: value.schema.trim() || null, name: value.name.trim() })
      : '';
  });
  protected readonly typeShort = computed(() => databaseObjectTypeShort(this.value().type));
  protected readonly hasMembers = computed(() => ['package', 'type'].includes(this.value().type));
  protected readonly memberCount = computed(() =>
    this.hasMembers() ? memberLines(this.value().members).length : 0,
  );
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

  /** Rellena tipo, esquema, nombre y SP a partir del DDL pegado. */
  protected detect(): void {
    const controls = this.group().controls;
    const parsed = parseObjectCode(controls.code.value);
    const found: string[] = [];
    if (parsed.type) {
      controls.type.setValue(parsed.type);
      found.push('tipo');
    }
    if (parsed.schema) {
      controls.schema.setValue(parsed.schema);
      found.push('esquema');
    }
    if (parsed.name) {
      controls.name.setValue(parsed.name);
      found.push('nombre');
    }
    if (parsed.members.length && ['package', 'type'].includes(controls.type.value)) {
      const members = memberLines([controls.members.value, ...parsed.members].join('\n'));
      controls.members.setValue(members.join('\n'));
      found.push(`${parsed.members.length} SP/funciones`);
    }
    this.group().markAsDirty();
    this.detected.set(
      found.length
        ? `Detectado: ${found.join(', ')}.`
        : 'No se reconoció un CREATE … ni procedimientos en el código.',
    );
  }
}
