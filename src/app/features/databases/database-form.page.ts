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
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DatabasesService } from '../../core/data/databases.service';
import { toAppError } from '../../core/errors/error-mapper';
import {
  DATABASE_ENGINES,
  DATABASE_ENVIRONMENTS,
  DATABASE_LIMITS,
  DATABASE_OBJECT_LIMITS,
  DatabaseEngine,
  DatabaseEnvironment,
  DatabaseInput,
  DEFAULT_PORT_BY_ENGINE,
} from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  createBaseResourceControls,
  ResourceBaseFields,
  toBaseResourceInput,
} from '../../shared/forms/resource-base-fields';
import { SelectField } from '../../shared/forms/select-field';
import { TextField } from '../../shared/forms/text-field';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { MarkdownField } from '../../shared/markdown/markdown-field';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { DatabaseObjectEditor } from './database-object-editor';
import { createObjectGroup, DatabaseObjectGroup, toDatabaseObject } from './database-object-form';
import { parseConnectionText } from './lib/connection-parser';

const PORT_PATTERN = /^\d{1,5}$/;

/** Puerto vacío o entero entre 1 y 65535. */
function portValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  if (!value) {
    return null;
  }
  const port = Number(value);
  return PORT_PATTERN.test(value) && port >= 1 && port <= 65535 ? null : { port: true };
}

/** Igual que el CHECK de la tabla: hace falta la cadena de conexión o el host. */
function hostOrConnectionString(group: AbstractControl): ValidationErrors | null {
  const host = (group.get('host')?.value as string | undefined)?.trim();
  const connection = (group.get('connection_string')?.value as string | undefined)?.trim();
  return host || connection ? null : { hostOrConnection: true };
}

/** Alta y edición de conexiones a bases de datos. */
@Component({
  selector: 'app-database-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    LoadState,
    ResourceBaseFields,
    SelectField,
    TextField,
    MarkdownField,
    DatabaseObjectEditor,
    Alert,
    Icon,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="mx-auto max-w-4xl">
      <app-page-header
        [title]="id() ? 'Editar conexión' : 'Nueva conexión'"
        [backLink]="cancelLink()"
        backLabel="Cancelar"
      />
      <app-load-state [state]="loader.state()" backLink="/databases">
        @if (forbidden()) {
          <app-alert type="warning" class="mt-6"
            >Solo el propietario puede editar esta conexión.</app-alert
          >
        }
        @if (error(); as message) {
          <app-alert type="error" class="mt-6">{{ message }}</app-alert>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-6" novalidate>
          <section class="card space-y-4 p-5" aria-labelledby="connection-section">
            <h2 id="connection-section" class="font-semibold">Conexión</h2>
            <app-text-field
              label="Cadena de conexión"
              fieldId="database-connection-string"
              type="textarea"
              [rows]="9"
              [optional]="true"
              [maxlength]="limits.connectionStringMax"
              hint="Pega la entrada de tnsnames.ora (con «##usuario/clave» encima si la tienes), una URL JDBC o host:puerto/servicio y pulsa «Detectar datos»."
              [control]="form.controls.connection_string"
            />
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="forbidden()"
                (click)="detect()"
              >
                <app-icon name="search" iconClass="size-4" /> Detectar datos
              </button>
              @if (detected(); as detected) {
                <p class="text-sm text-slate-600 dark:text-slate-400" role="status">
                  {{ detected }}
                </p>
              }
            </div>
          </section>

          <section class="card p-5">
            <app-resource-base-fields [controls]="form.controls" idPrefix="database" />
          </section>

          <section class="card space-y-4 p-5" aria-labelledby="server-section">
            <h2 id="server-section" class="font-semibold">Servidor</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <app-select-field
                label="Motor"
                fieldId="database-engine"
                [control]="form.controls.engine"
                [options]="engines"
              />
              <app-select-field
                label="Entorno"
                fieldId="database-environment"
                [control]="form.controls.environment"
                [options]="environments"
              />
            </div>
            <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <app-text-field
                label="Host"
                fieldId="database-host"
                [optional]="true"
                [maxlength]="limits.hostMax"
                placeholder="servidor.empresa.com"
                [control]="form.controls.host"
              />
              <app-text-field
                label="Puerto"
                fieldId="database-port"
                inputmode="numeric"
                [optional]="true"
                [maxlength]="5"
                [messages]="{ port: 'Entre 1 y 65535.' }"
                [control]="form.controls.port"
              />
            </div>
            <app-text-field
              label="Servicio / SID / base de datos"
              fieldId="database-service"
              [optional]="true"
              [maxlength]="limits.serviceNameMax"
              [control]="form.controls.service_name"
            />
            @if (form.hasError('hostOrConnection') && form.touched) {
              <p class="text-sm text-red-600 dark:text-red-400">
                Indica la cadena de conexión o el host.
              </p>
            }
          </section>

          <section class="card space-y-4 p-5" aria-labelledby="credentials-section">
            <h2 id="credentials-section" class="font-semibold">Credenciales</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <app-text-field
                label="Usuario"
                fieldId="database-username"
                [optional]="true"
                [maxlength]="limits.usernameMax"
                [control]="form.controls.username"
              />
              <app-text-field
                label="Contraseña"
                fieldId="database-password"
                type="password"
                autocomplete="new-password"
                [optional]="true"
                [maxlength]="limits.passwordMax"
                [control]="form.controls.password"
              />
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Se guardan solo en este equipo, dentro de la base de datos local (sin cifrar).
            </p>
          </section>

          <section class="space-y-3" aria-labelledby="objects-section">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="objects-section" class="font-semibold">Objetos</h2>
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  Packages con sus SP, procedimientos, tablas, vistas… Pega el DDL y pulsa «Detectar
                  del código».
                </p>
              </div>
              <button
                type="button"
                class="btn btn-secondary"
                [disabled]="forbidden() || objects.length >= objectLimits.objectsMax"
                (click)="addObject()"
              >
                <app-icon name="plus" iconClass="size-4" /> Agregar objeto
              </button>
            </div>
            @for (group of objects.controls; track group; let i = $index) {
              <app-database-object-editor
                [group]="group"
                [index]="i"
                [open]="newObjects.has(group)"
                (remove)="removeObject(i)"
              />
            } @empty {
              <p class="card p-4 text-sm text-slate-500 dark:text-slate-400">
                Sin objetos registrados.
              </p>
            }
          </section>

          <section class="card p-5">
            <app-markdown-field
              label="Notas"
              fieldId="database-notes"
              [rows]="6"
              [optional]="true"
              [maxlength]="limits.notesMax"
              hint="Esquemas útiles, permisos del usuario, VPN necesaria, a quién pedir acceso…"
              [control]="form.controls.notes"
            />
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
              {{ id() ? 'Guardar cambios' : 'Crear conexión' }}
            </button>
          </div>
        </form>
      </app-load-state>
    </div>
  `,
})
export class DatabaseFormPage implements HasUnsavedChanges {
  readonly id = input<string>();

  private readonly databases = inject(DatabasesService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly permissions = inject(ResourcePermissions);

  protected readonly limits = DATABASE_LIMITS;
  protected readonly engines = DATABASE_ENGINES;
  protected readonly environments = DATABASE_ENVIRONMENTS;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly forbidden = signal(false);
  protected readonly detected = signal<string | null>(null);
  protected readonly cancelLink = computed(() =>
    this.id() ? `/databases/${this.id()}` : '/databases',
  );

  protected readonly form = new FormGroup(
    {
      ...createBaseResourceControls(),
      engine: new FormControl<DatabaseEngine>('oracle', { nonNullable: true }),
      environment: new FormControl<DatabaseEnvironment>('dev', { nonNullable: true }),
      host: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(DATABASE_LIMITS.hostMax)],
      }),
      port: new FormControl('1521', { nonNullable: true, validators: [portValidator] }),
      service_name: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(DATABASE_LIMITS.serviceNameMax)],
      }),
      connection_string: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(DATABASE_LIMITS.connectionStringMax)],
      }),
      username: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(DATABASE_LIMITS.usernameMax)],
      }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(DATABASE_LIMITS.passwordMax)],
      }),
      notes: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(DATABASE_LIMITS.notesMax)],
      }),
      objects: new FormArray<DatabaseObjectGroup>([]),
    },
    { validators: hostOrConnectionString },
  );
  protected readonly objectLimits = DATABASE_OBJECT_LIMITS;
  /** Objetos agregados en esta edición: se muestran abiertos. */
  protected readonly newObjects = new WeakSet<DatabaseObjectGroup>();

  protected get objects(): FormArray<DatabaseObjectGroup> {
    return this.form.controls.objects;
  }

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.databases.getById(id),
  );

  constructor() {
    effect(() => {
      const database = this.loader.value();
      if (!database) {
        return;
      }
      untracked(() => {
        this.form.reset({
          title: database.title,
          description: database.description ?? '',
          tags: database.tags,
          visibility: database.visibility,
          engine: database.engine,
          environment: database.environment,
          host: database.host ?? '',
          port: database.port ? String(database.port) : '',
          service_name: database.service_name ?? '',
          connection_string: database.connection_string ?? '',
          username: database.username ?? '',
          password: database.password ?? '',
          notes: database.notes ?? '',
        });
        this.objects.clear({ emitEvent: false });
        for (const object of database.objects ?? []) {
          this.objects.push(createObjectGroup(object), { emitEvent: false });
        }
        if (!this.permissions.canEdit(database)) {
          this.forbidden.set(true);
          this.form.disable();
        }
      });
    });

    // Al cambiar de motor se propone su puerto habitual si el actual era el de otro motor.
    this.form.controls.engine.valueChanges.subscribe((engine) => {
      const port = this.form.controls.port;
      const defaults = Object.values(DEFAULT_PORT_BY_ENGINE).map(String);
      if (!port.value || defaults.includes(port.value)) {
        port.setValue(DEFAULT_PORT_BY_ENGINE[engine]?.toString() ?? '');
      }
    });
  }

  protected addObject(): void {
    const group = createObjectGroup();
    this.newObjects.add(group);
    this.objects.push(group);
    this.objects.markAsDirty();
  }

  protected removeObject(index: number): void {
    this.objects.removeAt(index);
    this.objects.markAsDirty();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  /** Rellena los campos con lo que se reconozca en la cadena pegada. */
  protected detect(): void {
    const controls = this.form.controls;
    const parsed = parseConnectionText(controls.connection_string.value);
    const found: string[] = [];

    const set = (
      control: FormControl<string>,
      value: string | number | undefined,
      label: string,
    ) => {
      if (value === undefined || value === '') {
        return;
      }
      control.setValue(String(value));
      control.markAsDirty();
      found.push(label);
    };

    if (parsed.engine) {
      controls.engine.setValue(parsed.engine);
      controls.engine.markAsDirty();
    }
    controls.connection_string.setValue(parsed.connectionString);
    if (!controls.title.value.trim()) {
      set(controls.title, parsed.alias, 'título');
    }
    set(controls.host, parsed.host, 'host');
    set(controls.port, parsed.port, 'puerto');
    set(controls.service_name, parsed.serviceName, 'servicio');
    set(controls.username, parsed.username, 'usuario');
    set(controls.password, parsed.password, 'contraseña');

    this.detected.set(
      found.length > 0
        ? `Detectado: ${found.join(', ')}. Revisa los campos antes de guardar.`
        : 'No se reconoció el formato: completa los campos a mano.',
    );
  }

  protected async submit(): Promise<void> {
    if (this.saving() || this.forbidden()) {
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Revisa los campos marcados antes de guardar.');
      return;
    }

    const value = this.form.getRawValue();
    const text = (raw: string) => raw.trim() || null;
    const payload: DatabaseInput = {
      ...toBaseResourceInput(value),
      engine: value.engine,
      environment: value.environment,
      host: text(value.host),
      port: value.port.trim() ? Number(value.port) : null,
      service_name: text(value.service_name),
      connection_string: text(value.connection_string),
      username: text(value.username),
      // La contraseña se guarda tal cual: los espacios pueden ser parte de ella.
      password: value.password || null,
      notes: text(value.notes),
      objects: this.objects.controls.map(toDatabaseObject),
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.id();
      const saved = id
        ? await this.databases.update(id, payload)
        : await this.databases.create(payload);
      this.form.markAsPristine();
      this.notifications.success(id ? 'Conexión actualizada.' : 'Conexión creada.');
      await this.router.navigate(['/databases', saved.id]);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
