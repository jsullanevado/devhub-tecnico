import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DatabasesService } from '../../core/data/databases.service';
import { ServicesService, SoapUiChange } from '../../core/data/services.service';
import { toAppError } from '../../core/errors/error-mapper';
import {
  DatabaseCatalogItem,
  SERVICE_AUTH_TYPES,
  SERVICE_LIMITS,
  SERVICE_PROTOCOLS,
  SERVICE_URL_PATTERN,
  Service,
  ServiceAuthType,
  ServiceCatalogItem,
  ServiceInput,
  ServiceKind,
  ServiceProtocol,
} from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { FilePicker } from '../../shared/forms/file-picker';
import { MarkdownField } from '../../shared/markdown/markdown-field';
import {
  createBaseResourceControls,
  ResourceBaseFields,
  toBaseResourceInput,
} from '../../shared/forms/resource-base-fields';
import { SelectField } from '../../shared/forms/select-field';
import { TextField } from '../../shared/forms/text-field';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { formatBytes } from '../../shared/utils/format';
import { OperationEditor } from './operation-editor';
import { createOperationGroup, OperationGroup, toOperation } from './service-form.model';

const optionalText = (max: number) =>
  new FormControl('', { nonNullable: true, validators: [Validators.maxLength(max)] });
const optionalUrl = (max: number) =>
  new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(max), Validators.pattern(SERVICE_URL_PATTERN)],
  });
const orNull = (value: string) => value.trim() || null;

/** Alta (/services/new) y edición (/services/:id/edit) de servicios. */
@Component({
  selector: 'app-service-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    LoadState,
    ResourceBaseFields,
    SelectField,
    TextField,
    MarkdownField,
    FilePicker,
    OperationEditor,
    Alert,
    Icon,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="mx-auto max-w-5xl">
      <app-page-header
        [title]="id() ? 'Editar servicio' : 'Nuevo servicio'"
        [backLink]="cancelLink()"
        backLabel="Cancelar"
      />
      <app-load-state [state]="loader.state()" backLink="/services">
        @if (forbidden()) {
          <app-alert type="warning" class="mt-6">
            Solo el propietario puede editar este servicio.
          </app-alert>
        }
        @if (error(); as message) {
          <app-alert type="error" class="mt-6">{{ message }}</app-alert>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-6" novalidate>
          <section class="card p-5" aria-labelledby="kind-heading">
            <h2 id="kind-heading" class="font-semibold">
              Tipo de componente <span class="text-red-600 dark:text-red-400">*</span>
            </h2>
            <div
              class="mt-3 grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-labelledby="kind-heading"
              [attr.aria-invalid]="kindInvalid() ? 'true' : null"
            >
              @for (option of kindOptions; track option.value) {
                <label
                  class="flex cursor-pointer items-start gap-3 rounded-md border p-4 transition"
                  [class]="
                    kind() === option.value
                      ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10'
                      : 'border-slate-300 hover:border-indigo-300 dark:border-slate-700'
                  "
                >
                  <input
                    type="radio"
                    class="mt-1 size-4 accent-indigo-600"
                    formControlName="kind"
                    [value]="option.value"
                  />
                  <span>
                    <span class="block font-medium">{{ option.label }}</span>
                    <span class="block text-sm text-slate-500 dark:text-slate-400">{{
                      option.hint
                    }}</span>
                  </span>
                </label>
              }
            </div>
            @if (kindInvalid()) {
              <p class="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                Elige si es un servicio o un DataPower.
              </p>
            }
          </section>

          <section class="card p-5">
            <app-resource-base-fields [controls]="form.controls" idPrefix="service" />
          </section>

          <section class="card space-y-4 p-5" aria-labelledby="connection-heading">
            <h2 id="connection-heading" class="font-semibold">Conexión</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <app-select-field
                  label="Protocolo"
                  fieldId="service-protocol"
                  [control]="form.controls.protocol"
                  [options]="protocols"
                />
              </div>
              <app-text-field
                label="Sistema"
                fieldId="service-system"
                [control]="form.controls.system"
                placeholder="SIAC, OM, TCRM…"
                [optional]="true"
                [maxlength]="limits.systemMax"
              />
            </div>
            <app-text-field
              label="URL base (endpoint)"
              fieldId="service-base-url"
              [control]="form.controls.base_url"
              placeholder="http://172.19.172.21 o https://dp-qa.miempresa.com:5443"
              hint="Las operaciones añaden su recurso a esta URL."
              [maxlength]="limits.urlMax"
              [messages]="{
                pattern: 'Debe empezar por http:// o https:// y no contener espacios.',
              }"
            />
            <app-text-field
              label="WSDL"
              fieldId="service-wsdl"
              [control]="form.controls.wsdl_url"
              placeholder="https://…/Servicio?wsdl"
              [optional]="true"
              [maxlength]="limits.wsdlMax"
              [messages]="{
                pattern: 'Debe empezar por http:// o https:// y no contener espacios.',
              }"
            />
            @if (isDataPower()) {
              <div class="grid gap-4 sm:grid-cols-2">
                <app-text-field
                  label="Dominio DataPower"
                  fieldId="service-dp-domain"
                  [control]="form.controls.datapower_domain"
                  placeholder="MIG1_postventa"
                  [optional]="true"
                  [maxlength]="limits.datapowerDomainMax"
                />
                <app-text-field
                  label="Servicio DataPower (MPGW / WS-Proxy)"
                  fieldId="service-dp-object"
                  [control]="form.controls.datapower_object"
                  placeholder="mpgw_svcProblem"
                  [optional]="true"
                  [maxlength]="limits.datapowerObjectMax"
                />
              </div>
            }
          </section>

          <section class="card space-y-4 p-5" aria-labelledby="auth-heading">
            <h2 id="auth-heading" class="font-semibold">Autenticación</h2>
            <div>
              <app-select-field
                label="Tipo"
                fieldId="service-auth-type"
                [control]="form.controls.auth_type"
                [options]="authTypes"
              />
            </div>
            @if (authType() !== 'none') {
              <div class="grid gap-4 sm:grid-cols-2">
                <app-text-field
                  [label]="authType() === 'api_key' ? 'Nombre del header' : 'Usuario'"
                  fieldId="service-auth-username"
                  [control]="form.controls.auth_username"
                  [placeholder]="authType() === 'api_key' ? 'x-api-key' : ''"
                  [optional]="true"
                  [maxlength]="limits.authUsernameMax"
                />
                <app-text-field
                  [label]="authType() === 'basic' ? 'Contraseña' : 'Token / clave'"
                  fieldId="service-auth-secret"
                  type="password"
                  autocomplete="new-password"
                  [control]="form.controls.auth_secret"
                  [optional]="true"
                  [maxlength]="limits.authSecretMax"
                />
              </div>
              <app-text-field
                label="Notas de acceso"
                fieldId="service-auth-notes"
                type="textarea"
                [rows]="2"
                [control]="form.controls.auth_notes"
                placeholder="Ambiente, quién las gestiona, caducidad…"
                [optional]="true"
                [maxlength]="limits.authNotesMax"
              />
              <app-alert type="info">
                Las credenciales se guardan solo en este equipo, dentro de la base de datos local.
                Evita guardar las de producción.
              </app-alert>
            }
          </section>

          <section class="card space-y-4 p-5" aria-labelledby="soapui-heading">
            <h2 id="soapui-heading" class="font-semibold">Proyecto SoapUI (opcional)</h2>
            @if (currentFile(); as file) {
              <div class="flex flex-wrap items-center gap-3 text-sm">
                <app-icon name="file-code" iconClass="size-5 text-slate-400" />
                <span>{{ file.name }} ({{ size(file.size) }})</span>
                <label class="ms-auto flex items-center gap-2">
                  <input
                    type="checkbox"
                    class="size-4 accent-indigo-600"
                    [checked]="removeFile()"
                    [disabled]="forbidden()"
                    (change)="toggleRemoveFile()"
                  />
                  Quitar el proyecto actual
                </label>
              </div>
            }
            @if (!removeFile()) {
              <app-file-picker
                inputId="service-soapui"
                accept=".xml"
                [hint]="
                  (currentFile() ? 'Sube otro para sustituirlo. ' : '') +
                  'El archivo *-soapui-project.xml, máximo 50 MB.'
                "
                [file]="soapUiFile()"
                [error]="soapUiError()"
                [disabled]="forbidden() || saving()"
                (fileChange)="onSoapUiFile($event)"
              />
            }
          </section>

          <section class="card p-5">
            <app-markdown-field
              label="Notas del servicio"
              fieldId="service-notes"
              [control]="form.controls.notes"
              [rows]="5"
              [optional]="true"
              [maxlength]="limits.notesMax"
              hint="Markdown: ambientes, dependencias, contactos, errores frecuentes…"
            />
          </section>

          <section class="space-y-4" aria-labelledby="operations-heading">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 id="operations-heading" class="text-lg font-semibold">
                Operaciones ({{ operations().length }})
              </h2>
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="forbidden() || operations().length >= limits.operationsMax"
                (click)="addOperation()"
              >
                <app-icon name="plus" iconClass="size-4" /> Añadir operación
              </button>
            </div>
            @if (operations().length === 0) {
              <p class="text-sm text-slate-500 dark:text-slate-400">
                Añade al menos una operación con su request y response de ejemplo.
              </p>
            }
            @for (operation of operations(); track operation; let index = $index) {
              <app-operation-editor
                [group]="operation"
                [index]="index"
                [total]="operations().length"
                [protocol]="protocol()"
                [catalog]="targetCatalog()"
                [databases]="databaseCatalog()"
                [dataPower]="isDataPower()"
                (remove)="removeOperation(index)"
                (duplicate)="duplicateOperation(index)"
                (moveUp)="moveOperation(index, -1)"
                (moveDown)="moveOperation(index, 1)"
              />
            }
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Revisa que los ejemplos no contengan datos reales de clientes.
            </p>
          </section>

          <div class="form-actions">
            @if (form.dirty) {
              <span
                class="flex items-center gap-1.5 text-sm text-amber-700 sm:me-auto dark:text-amber-300"
              >
                <span class="size-2 rounded-full bg-amber-500" aria-hidden="true"></span>
                Cambios sin guardar
              </span>
            }
            <a [routerLink]="cancelLink()" class="btn btn-secondary">Cancelar</a>
            <button type="submit" class="btn btn-primary" [disabled]="saving() || forbidden()">
              @if (saving()) {
                <app-spinner size="sm" label="Guardando…" />
              }
              {{ id() ? 'Guardar cambios' : 'Crear servicio' }}
            </button>
          </div>
        </form>
      </app-load-state>
    </div>
  `,
})
export class ServiceFormPage implements HasUnsavedChanges {
  /** Presente solo al editar (parámetro :id de la ruta). */
  readonly id = input<string>();

  private readonly services = inject(ServicesService);
  private readonly databases = inject(DatabasesService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly permissions = inject(ResourcePermissions);

  protected readonly protocols = SERVICE_PROTOCOLS;
  protected readonly authTypes = SERVICE_AUTH_TYPES;
  protected readonly limits = SERVICE_LIMITS;
  protected readonly size = formatBytes;
  protected readonly saving = signal(false);
  /** Cambia al intentar guardar: muestra los errores aunque el formulario no emita valor. */
  private readonly submitted = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly forbidden = signal(false);
  protected readonly soapUiFile = signal<File | null>(null);
  protected readonly soapUiError = signal<string | null>(null);
  protected readonly removeFile = signal(false);
  protected readonly currentFile = signal<{ name: string; size: number } | null>(null);
  protected readonly cancelLink = computed(() =>
    this.id() ? `/services/${this.id()}` : '/services',
  );

  protected readonly kindOptions = [
    {
      value: 'service',
      label: 'Servicio',
      hint: 'REST o SOAP de backend. Puede llamar a varios servicios y usar SP.',
    },
    {
      value: 'datapower',
      label: 'DataPower',
      hint: 'Expone y enruta cada operación a un solo servicio. No usa SP.',
    },
  ] as const;

  protected readonly form = new FormGroup({
    // Obligatorio: sin valor por defecto para que se elija a conciencia.
    kind: new FormControl<ServiceKind | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    ...createBaseResourceControls(),
    system: optionalText(SERVICE_LIMITS.systemMax),
    protocol: new FormControl<ServiceProtocol>('rest', { nonNullable: true }),
    base_url: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(SERVICE_LIMITS.urlMax),
        Validators.pattern(SERVICE_URL_PATTERN),
      ],
    }),
    wsdl_url: optionalUrl(SERVICE_LIMITS.wsdlMax),
    datapower_domain: optionalText(SERVICE_LIMITS.datapowerDomainMax),
    datapower_object: optionalText(SERVICE_LIMITS.datapowerObjectMax),
    auth_type: new FormControl<ServiceAuthType>('none', { nonNullable: true }),
    auth_username: optionalText(SERVICE_LIMITS.authUsernameMax),
    auth_secret: optionalText(SERVICE_LIMITS.authSecretMax),
    auth_notes: optionalText(SERVICE_LIMITS.authNotesMax),
    notes: optionalText(SERVICE_LIMITS.notesMax),
    operations: new FormArray<OperationGroup>([createOperationGroup()]),
  });

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.services.getById(id),
  );

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly protocol = computed(() => this.formValue().protocol ?? 'rest');
  protected readonly kind = computed(() => this.formValue().kind ?? '');
  /** DataPower: cada operación enruta a un solo servicio y no usa SP. */
  protected readonly isDataPower = computed(() => this.kind() === 'datapower');
  protected readonly kindInvalid = computed(() => {
    this.formValue();
    this.submitted();
    const control = this.form.controls.kind;
    return control.invalid && control.touched;
  });
  protected readonly authType = computed(() => this.formValue().auth_type ?? 'none');
  /** Lista de grupos (nueva referencia en cada cambio para que la vista se actualice). */
  protected readonly targetCatalog = computed(() =>
    this.catalog().filter((item) => item.id !== this.id()),
  );
  protected readonly operations = computed(() => {
    this.formValue();
    return [...this.form.controls.operations.controls];
  });

  /** Servicios que pueden ser destino de una operación (todos menos este). */
  protected readonly catalog = signal<ServiceCatalogItem[]>([]);
  /** Conexiones con sus objetos, para indicar qué package/SP/tabla usa cada operación. */
  protected readonly databaseCatalog = signal<DatabaseCatalogItem[]>([]);

  constructor() {
    void this.services
      .catalog()
      .then((items) => this.catalog.set(items))
      .catch(() => this.catalog.set([]));
    void this.databases
      .catalog()
      .then((items) => this.databaseCatalog.set(items))
      .catch(() => this.databaseCatalog.set([]));
    effect(() => {
      const service = this.loader.value();
      if (service) {
        untracked(() => this.fill(service));
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return (this.form.dirty || this.soapUiFile() !== null || this.removeFile()) && !this.saving();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  protected async onSoapUiFile(file: File | null): Promise<void> {
    this.soapUiFile.set(file);
    this.soapUiError.set(file ? await this.services.checkSoapUiFile(file) : null);
  }

  protected toggleRemoveFile(): void {
    this.removeFile.update((remove) => !remove);
    this.soapUiFile.set(null);
    this.soapUiError.set(null);
  }

  protected addOperation(): void {
    const operations = this.form.controls.operations;
    operations.push(createOperationGroup());
    operations.markAsDirty();
  }

  protected removeOperation(index: number): void {
    const operations = this.form.controls.operations;
    operations.removeAt(index);
    operations.markAsDirty();
  }

  protected duplicateOperation(index: number): void {
    const operations = this.form.controls.operations;
    const copy = toOperation(operations.at(index));
    operations.insert(index + 1, createOperationGroup({ ...copy, name: `${copy.name} (copia)` }));
    operations.markAsDirty();
  }

  protected moveOperation(index: number, step: -1 | 1): void {
    const operations = this.form.controls.operations;
    const target = index + step;
    if (target < 0 || target >= operations.length) {
      return;
    }
    const group = operations.at(index);
    operations.removeAt(index, { emitEvent: false });
    operations.insert(target, group);
    operations.markAsDirty();
  }

  protected async submit(): Promise<void> {
    if (this.saving() || this.forbidden()) {
      return;
    }
    this.form.markAllAsTouched();
    this.submitted.update((count) => count + 1);
    if (this.soapUiError()) {
      this.error.set('Revisa el proyecto SoapUI antes de guardar.');
      return;
    }
    if (this.form.invalid) {
      this.error.set('Revisa los campos marcados antes de guardar.');
      return;
    }

    const value = this.form.getRawValue();
    const hasAuth = value.auth_type !== 'none';
    const dataPower = value.kind === 'datapower';
    const payload: ServiceInput = {
      kind: value.kind as ServiceKind,
      ...toBaseResourceInput(value),
      system: orNull(value.system),
      protocol: value.protocol,
      base_url: value.base_url.trim(),
      wsdl_url: orNull(value.wsdl_url),
      datapower_domain: dataPower ? orNull(value.datapower_domain) : null,
      datapower_object: dataPower ? orNull(value.datapower_object) : null,
      auth_type: value.auth_type,
      auth_username: hasAuth ? orNull(value.auth_username) : null,
      auth_secret: hasAuth ? value.auth_secret || null : null,
      auth_notes: hasAuth ? orNull(value.auth_notes) : null,
      notes: orNull(value.notes),
      operations: this.form.controls.operations.controls.map((group) => toOperation(group)),
    };
    const file = this.soapUiFile();
    const soapUi: SoapUiChange = file
      ? { kind: 'replace', file }
      : this.removeFile()
        ? { kind: 'remove' }
        : { kind: 'keep' };

    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.id();
      const saved = await this.services.save(id, payload, soapUi);
      this.form.markAsPristine();
      this.soapUiFile.set(null);
      this.removeFile.set(false);
      this.notifications.success(id ? 'Servicio actualizado.' : 'Servicio creado.');
      await this.router.navigate(['/services', saved.id]);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private fill(service: Service): void {
    const operations = this.form.controls.operations;
    operations.clear({ emitEvent: false });
    for (const operation of service.operations) {
      operations.push(createOperationGroup(operation), { emitEvent: false });
    }
    this.form.reset({
      kind: service.kind,
      title: service.title,
      description: service.description ?? '',
      tags: service.tags,
      visibility: service.visibility,
      system: service.system ?? '',
      protocol: service.protocol,
      base_url: service.base_url,
      wsdl_url: service.wsdl_url ?? '',
      datapower_domain: service.datapower_domain ?? '',
      datapower_object: service.datapower_object ?? '',
      auth_type: service.auth_type,
      auth_username: service.auth_username ?? '',
      auth_secret: service.auth_secret ?? '',
      auth_notes: service.auth_notes ?? '',
      notes: service.notes ?? '',
    });
    this.currentFile.set(
      service.soapui_file_name
        ? { name: service.soapui_file_name, size: service.soapui_file_size ?? 0 }
        : null,
    );
    if (!this.permissions.canEdit(service)) {
      this.forbidden.set(true);
      this.form.disable();
    }
  }
}
