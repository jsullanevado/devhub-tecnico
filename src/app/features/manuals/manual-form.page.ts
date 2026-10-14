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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ManualsService } from '../../core/data/manuals.service';
import { toAppError } from '../../core/errors/error-mapper';
import {
  MANUAL_ACCEPT_ATTRIBUTE,
  MANUAL_CATEGORIES,
  MANUAL_FILE_TYPES,
  MANUAL_MAX_FILE_MB,
  ManualCategory,
  ManualInput,
  RESOURCE_LIMITS,
} from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { FilePicker } from '../../shared/forms/file-picker';
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
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { formatBytes } from '../../shared/utils/format';

const ALLOWED_EXTENSIONS = [...new Set(MANUAL_FILE_TYPES.map((type) => type.extension))].join(', ');

/** Subida (/manuals/new) y edición de metadatos o sustitución del archivo (/manuals/:id/edit). */
@Component({
  selector: 'app-manual-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    LoadState,
    ResourceBaseFields,
    SelectField,
    TextField,
    FilePicker,
    Alert,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="mx-auto max-w-4xl">
      <app-page-header
        [title]="id() ? 'Editar documento' : 'Subir documento'"
        [backLink]="cancelLink()"
        backLabel="Cancelar"
      />
      <app-load-state [state]="loader.state()" backLink="/manuals">
        @if (forbidden()) {
          <app-alert type="warning" class="mt-6">
            Solo el propietario puede editar este documento.
          </app-alert>
        }
        @if (error(); as message) {
          <app-alert type="error" class="mt-6">{{ message }}</app-alert>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-6" novalidate>
          <section class="card space-y-3 p-5" aria-labelledby="manual-file-heading">
            <h2 id="manual-file-heading" class="font-semibold">
              {{ id() ? 'Sustituir archivo (opcional)' : 'Archivo' }}
            </h2>
            @if (loader.value(); as current) {
              <p class="text-sm text-slate-600 dark:text-slate-400">
                Archivo actual: <strong>{{ current.file_name }}</strong> ·
                {{ size(current.file_size) }}
              </p>
            }
            <app-file-picker
              inputId="manual-file"
              [accept]="accept"
              [hint]="'Formatos: ' + allowedExtensions + '. Máximo ' + maxFileMb + ' MB.'"
              [file]="file()"
              [error]="fileError()"
              [disabled]="forbidden() || saving()"
              (fileChange)="onFileChange($event)"
            />
            @if (checkingFile()) {
              <p class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <app-spinner size="sm" label="" /> Verificando el archivo…
              </p>
            }
          </section>

          <section class="card p-5">
            <app-resource-base-fields [controls]="form.controls" idPrefix="manual" />
          </section>

          <section class="card p-5">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <app-select-field
                  label="Categoría"
                  fieldId="manual-category"
                  [control]="form.controls.category"
                  [options]="categories"
                />
              </div>
              <div>
                <app-text-field
                  label="Versión"
                  fieldId="manual-version"
                  placeholder="p. ej. 2.1"
                  [optional]="true"
                  [maxlength]="30"
                  [control]="form.controls.version"
                />
              </div>
            </div>
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
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="saving() || forbidden() || checkingFile()"
            >
              @if (saving()) {
                <app-spinner size="sm" label="" />
                {{ file() ? 'Subiendo archivo…' : 'Guardando…' }}
              } @else {
                {{ id() ? 'Guardar cambios' : 'Subir documento' }}
              }
            </button>
          </div>
        </form>
      </app-load-state>
    </div>
  `,
})
export class ManualFormPage implements HasUnsavedChanges {
  readonly id = input<string>();

  private readonly manuals = inject(ManualsService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly permissions = inject(ResourcePermissions);

  protected readonly accept = MANUAL_ACCEPT_ATTRIBUTE;
  protected readonly allowedExtensions = ALLOWED_EXTENSIONS;
  protected readonly maxFileMb = MANUAL_MAX_FILE_MB;
  protected readonly categories = MANUAL_CATEGORIES;
  protected readonly size = formatBytes;
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly checkingFile = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly forbidden = signal(false);
  protected readonly cancelLink = computed(() =>
    this.id() ? `/manuals/${this.id()}` : '/manuals',
  );

  protected readonly form = new FormGroup({
    ...createBaseResourceControls(),
    category: new FormControl<ManualCategory>('manual', { nonNullable: true }),
    version: new FormControl('', { nonNullable: true, validators: Validators.maxLength(30) }),
  });

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.manuals.getById(id),
  );

  constructor() {
    effect(() => {
      const manual = this.loader.value();
      if (!manual) {
        return;
      }
      untracked(() => {
        this.form.reset({
          title: manual.title,
          description: manual.description ?? '',
          tags: manual.tags,
          visibility: manual.visibility,
          category: manual.category,
          version: manual.version ?? '',
        });
        if (!this.permissions.canEdit(manual)) {
          this.forbidden.set(true);
          this.form.disable();
        }
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return (this.form.dirty || this.file() !== null) && !this.saving();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  protected async onFileChange(file: File | null): Promise<void> {
    this.fileError.set(null);
    this.file.set(null);
    if (!file) {
      return;
    }
    this.checkingFile.set(true);
    try {
      const result = await this.manuals.checkFile(file);
      if (!result.valid) {
        this.fileError.set(result.message);
        return;
      }
      this.file.set(file);
      // Sugiere el título a partir del nombre si aún está vacío.
      const title = this.form.controls.title;
      if (!title.value.trim()) {
        title.setValue(
          file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[_-]+/g, ' ')
            .slice(0, RESOURCE_LIMITS.titleMax),
        );
        title.markAsDirty();
      }
    } finally {
      this.checkingFile.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (this.saving() || this.forbidden() || this.checkingFile()) {
      return;
    }
    this.form.markAllAsTouched();
    const id = this.id();
    const file = this.file();
    if (!id && !file) {
      this.fileError.set('Selecciona el archivo que quieres subir.');
    }
    if (this.form.invalid || (!id && !file)) {
      this.error.set('Revisa los campos marcados antes de guardar.');
      return;
    }

    const value = this.form.getRawValue();
    const metadata: ManualInput = {
      ...toBaseResourceInput(value),
      category: value.category,
      version: value.version.trim() || null,
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      let saved;
      if (id) {
        saved = await this.manuals.update(id, metadata);
        if (file) {
          saved = await this.manuals.replaceFile(saved, file);
        }
      } else {
        saved = await this.manuals.createWithFile(file as File, metadata);
      }
      this.form.markAsPristine();
      this.file.set(null);
      this.notifications.success(id ? 'Documento actualizado.' : 'Documento subido.');
      await this.router.navigate(['/manuals', saved.id]);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
