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
import {
  COMMON_MEDIA_TYPES,
  DatabaseCatalogItem,
  databaseObjectKey,
  HTTP_METHODS,
  SERVICE_LIMITS,
  ServiceCatalogItem,
  bodyLanguage,
  serviceProtocolLabel,
} from '../../core/models';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { Icon } from '../../shared/ui/icon/icon';
import { formatXml } from '../tools/lib/xml';
import { KeyValueEditor } from './key-value-editor';
import {
  createDbRefGroup,
  createTargetGroup,
  DB_REFS_MAX,
  OperationGroup,
  TARGETS_MAX,
} from './service-form.model';

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

      <!-- Servicios a los que llama (DataPower: uno; REST/SOAP: varios) -->
      <div class="mt-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="label">{{
            dataPower() ? 'Enruta a (servicio destino, opcional)' : 'Llama a servicios (opcional)'
          }}</span>
          @if (targets().length < targetsMax()) {
            <button type="button" class="link text-sm" (click)="addTarget()">
              + Agregar servicio destino
            </button>
          }
        </div>
        @for (target of targets(); track target; let t = $index) {
          @let targetPrefix = prefix + '-target-' + t;
          @let targetOps = operationsOf(target.controls.service_id.value);
          <div
            class="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            [formGroup]="target"
            role="group"
            [attr.aria-label]="'Servicio destino ' + (t + 1)"
          >
            <div>
              <label class="text-xs text-slate-500 dark:text-slate-400" [for]="targetPrefix"
                >Servicio destino</label
              >
              <select class="input mt-1" [id]="targetPrefix" formControlName="service_id">
                <option value="">— Elegir —</option>
                @for (item of catalog(); track item.id) {
                  <option [value]="item.id">
                    {{ item.title }} · {{ protocolLabel(item.protocol)
                    }}{{ item.kind === 'datapower' ? ' · DataPower' : '' }}
                  </option>
                }
                @if (isMissing(target.controls.service_id.value)) {
                  <option [value]="target.controls.service_id.value">
                    (servicio no encontrado)
                  </option>
                }
              </select>
            </div>
            <div>
              <label class="text-xs text-slate-500 dark:text-slate-400" [for]="targetPrefix + '-op'"
                >Operación destino (opcional)</label
              >
              @if (targetOps.length) {
                <select class="input mt-1" [id]="targetPrefix + '-op'" formControlName="operation">
                  <option value="">— Sin especificar —</option>
                  @for (name of targetOps; track name) {
                    <option [value]="name">{{ name }}</option>
                  }
                </select>
              } @else {
                <input
                  class="input mt-1"
                  [id]="targetPrefix + '-op'"
                  formControlName="operation"
                  [maxlength]="limits.operationNameMax"
                  placeholder="Sin operaciones registradas"
                />
              }
            </div>
            <button
              type="button"
              class="btn-icon text-red-600 dark:text-red-400"
              [attr.aria-label]="'Quitar servicio destino ' + (t + 1)"
              (click)="removeTarget(t)"
            >
              <app-icon name="trash" iconClass="size-4" />
            </button>
          </div>
        }
        @if (!targets().length) {
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {{
              dataPower()
                ? 'El servicio REST/SOAP al que enruta esta operación del DataPower.'
                : 'Otros servicios que invoca esta operación (puede ser más de uno).'
            }}
          </p>
        }
        @if (dataPower() && targets().length > 1) {
          <p class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
            Un DataPower enruta cada operación a un solo servicio: deja solo uno.
          </p>
        }
      </div>

      <!-- Objetos de BD que usa (package + SP, tabla…); un DataPower no los usa -->
      @if (!dataPower() || dbRefs().length) {
        <div class="mt-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="label">Objetos de BD que usa (opcional)</span>
            <button
              type="button"
              class="link text-sm"
              [disabled]="dbRefs().length >= dbRefsMax"
              (click)="addDbRef()"
            >
              + Agregar objeto de BD
            </button>
          </div>
          @for (ref of dbRefs(); track ref; let r = $index) {
            @let refPrefix = prefix + '-dbref-' + r;
            <div
              class="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
              [formGroup]="ref"
              role="group"
              [attr.aria-label]="'Objeto de BD ' + (r + 1)"
            >
              <div>
                <label class="text-xs text-slate-500 dark:text-slate-400" [for]="refPrefix + '-db'"
                  >Conexión de BD</label
                >
                <select class="input mt-1" [id]="refPrefix + '-db'" formControlName="database_id">
                  <option value="">— Elegir —</option>
                  @for (database of databases(); track database.id) {
                    <option [value]="database.id">{{ database.title }}</option>
                  }
                  @if (
                    ref.controls.database_id.value && !findDatabase(ref.controls.database_id.value)
                  ) {
                    <option [value]="ref.controls.database_id.value">
                      (conexión no encontrada)
                    </option>
                  }
                </select>
              </div>
              <div>
                <label
                  class="text-xs text-slate-500 dark:text-slate-400"
                  [for]="refPrefix + '-object'"
                  >Objeto (package, SP, tabla…)</label
                >
                <input
                  class="input mt-1 font-mono"
                  [id]="refPrefix + '-object'"
                  formControlName="object"
                  [attr.list]="refPrefix + '-objects'"
                  placeholder="USRPROM.PKG_CLIENTE"
                  maxlength="257"
                  spellcheck="false"
                />
                <datalist [id]="refPrefix + '-objects'">
                  @for (key of objectKeys(ref.controls.database_id.value); track key) {
                    <option [value]="key"></option>
                  }
                </datalist>
              </div>
              <div>
                <label
                  class="text-xs text-slate-500 dark:text-slate-400"
                  [for]="refPrefix + '-member'"
                  >SP / función (opcional)</label
                >
                @if (
                  membersOf(ref.controls.database_id.value, ref.controls.object.value);
                  as members
                ) {
                  <select
                    class="input mt-1 font-mono"
                    [id]="refPrefix + '-member'"
                    formControlName="member"
                  >
                    <option value="">— Todo el objeto —</option>
                    @for (member of members; track member) {
                      <option [value]="member">{{ member }}</option>
                    }
                    @if (
                      ref.controls.member.value && !members.includes(ref.controls.member.value)
                    ) {
                      <option [value]="ref.controls.member.value">
                        {{ ref.controls.member.value }}
                      </option>
                    }
                  </select>
                } @else {
                  <input
                    class="input mt-1 font-mono"
                    [id]="refPrefix + '-member'"
                    formControlName="member"
                    placeholder="SP_REGISTRAR_CLIENTE"
                    maxlength="128"
                    spellcheck="false"
                  />
                }
              </div>
              <button
                type="button"
                class="btn-icon text-red-600 dark:text-red-400"
                [attr.aria-label]="'Quitar objeto de BD ' + (r + 1)"
                (click)="removeDbRef(r)"
              >
                <app-icon name="trash" iconClass="size-4" />
              </button>
            </div>
          }
          @if (!dbRefs().length) {
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Packages, procedimientos o tablas que ejecuta esta operación (se registran en Bases de
              datos).
            </p>
          }
        </div>
        @if (dataPower() && dbRefs().length) {
          <p class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
            Un DataPower no ejecuta SP: registra los objetos de BD en el servicio de backend.
          </p>
        }
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
  /** Servicios que pueden ser destino de la operación (sin el propio servicio). */
  readonly catalog = input<readonly ServiceCatalogItem[]>([]);
  /** Conexiones con sus objetos, para elegir qué package/SP/tabla usa la operación. */
  readonly databases = input<readonly DatabaseCatalogItem[]>([]);
  /** El servicio es un DataPower: un solo destino por operación y sin objetos de BD. */
  readonly dataPower = input(false);

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
  protected readonly targets = computed(() => {
    this.changes();
    return [...this.group().controls.targets.controls];
  });
  protected readonly targetsMax = computed(() => (this.dataPower() ? 1 : TARGETS_MAX));
  protected readonly protocolLabel = serviceProtocolLabel;
  protected readonly dbRefsMax = DB_REFS_MAX;
  protected readonly dbRefs = computed(() => {
    this.changes();
    return [...this.group().controls.db_refs.controls];
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

  protected addTarget(): void {
    const targets = this.group().controls.targets;
    targets.push(createTargetGroup());
    targets.markAsDirty();
  }

  protected removeTarget(index: number): void {
    const targets = this.group().controls.targets;
    targets.removeAt(index);
    targets.markAsDirty();
  }

  /** Operaciones del servicio destino (para el desplegable). */
  protected operationsOf(serviceId: string): string[] {
    return this.catalog().find((item) => item.id === serviceId)?.operations ?? [];
  }

  /** Destino guardado que ya no está en el catálogo (servicio borrado). */
  protected isMissing(serviceId: string): boolean {
    return (
      !!serviceId &&
      this.catalog().length > 0 &&
      !this.catalog().some((item) => item.id === serviceId)
    );
  }

  protected addDbRef(): void {
    const refs = this.group().controls.db_refs;
    // Por comodidad se propone la conexión de la referencia anterior.
    const previous = refs.at(refs.length - 1)?.controls.database_id.value ?? '';
    refs.push(createDbRefGroup({ database_id: previous }));
    refs.markAsDirty();
  }

  protected removeDbRef(index: number): void {
    const refs = this.group().controls.db_refs;
    refs.removeAt(index);
    refs.markAsDirty();
  }

  protected findDatabase(id: string): DatabaseCatalogItem | undefined {
    return this.databases().find((database) => database.id === id);
  }

  /** ESQUEMA.NOMBRE de los objetos de la conexión (sugerencias). */
  protected objectKeys(databaseId: string): string[] {
    return (this.findDatabase(databaseId)?.objects ?? []).map(databaseObjectKey);
  }

  /** SP y funciones del package elegido; null si no se conoce o no tiene. */
  protected membersOf(databaseId: string, object: string): string[] | null {
    const ref = object.trim().toUpperCase();
    const found = (this.findDatabase(databaseId)?.objects ?? []).find((item) => {
      const key = databaseObjectKey(item).toUpperCase();
      return key === ref || item.name.toUpperCase() === ref;
    });
    return found?.members?.length ? found.members : null;
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
