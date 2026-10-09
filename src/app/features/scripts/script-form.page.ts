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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ScriptsService } from '../../core/data/scripts.service';
import { toAppError } from '../../core/errors/error-mapper';
import {
  DEFAULT_LANGUAGE_BY_CATEGORY,
  SCRIPT_CATEGORIES,
  SCRIPT_LANGUAGE_PATTERN,
  SCRIPT_LANGUAGES,
  SCRIPT_LIMITS,
  ScriptCategory,
  ScriptInput,
} from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { controlErrorMessage, trackControlErrors } from '../../shared/forms/form-errors';
import {
  createBaseResourceControls,
  ResourceBaseFields,
  toBaseResourceInput,
} from '../../shared/forms/resource-base-fields';
import { SelectField } from '../../shared/forms/select-field';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { notBlank } from '../../shared/forms/validators';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { Alert } from '../../shared/ui/alert/alert';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';

/** Alta (/scripts/new) y edición (/scripts/:id/edit) de scripts. */
@Component({
  selector: 'app-script-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    LoadState,
    ResourceBaseFields,
    SelectField,
    CodeEditor,
    Alert,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="mx-auto max-w-4xl">
      <app-page-header
        [title]="id() ? 'Editar script' : 'Nuevo script'"
        [backLink]="cancelLink()"
        backLabel="Cancelar"
      />
      <app-load-state [state]="loader.state()" backLink="/scripts">
        @if (forbidden()) {
          <app-alert type="warning" class="mt-6">
            Solo el propietario puede editar este script.
          </app-alert>
        }
        @if (error(); as message) {
          <app-alert type="error" class="mt-6">{{ message }}</app-alert>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-6" novalidate>
          <section class="card p-5">
            <app-resource-base-fields [controls]="form.controls" idPrefix="script" />
          </section>

          <section class="card space-y-4 p-5">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <app-select-field
                  label="Categoría"
                  fieldId="script-category"
                  [control]="form.controls.category"
                  [options]="categories"
                />
              </div>
              <div>
                <app-select-field
                  label="Lenguaje (resaltado y extensión)"
                  fieldId="script-language"
                  [control]="form.controls.language"
                  [options]="languages"
                />
              </div>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="size-4 accent-indigo-600"
                formControlName="is_template"
              />
              Es una plantilla reutilizable
            </label>
            <div>
              <span class="label" id="script-content-label">Código</span>
              <app-code-editor
                class="mt-1"
                formControlName="content"
                [language]="language()"
                ariaLabel="Código del script"
              />
              @if (contentError(); as message) {
                <p class="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {{ message }}
                </p>
              } @else {
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No incluyas contraseñas, tokens ni datos reales sensibles.
                </p>
              }
            </div>
          </section>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <a [routerLink]="cancelLink()" class="btn btn-secondary">Cancelar</a>
            <button type="submit" class="btn btn-primary" [disabled]="saving() || forbidden()">
              @if (saving()) {
                <app-spinner size="sm" label="Guardando…" />
              }
              {{ id() ? 'Guardar cambios' : 'Crear script' }}
            </button>
          </div>
        </form>
      </app-load-state>
    </div>
  `,
})
export class ScriptFormPage implements HasUnsavedChanges {
  /** Presente solo al editar (parámetro :id de la ruta). */
  readonly id = input<string>();

  private readonly scripts = inject(ScriptsService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly permissions = inject(ResourcePermissions);

  protected readonly categories = SCRIPT_CATEGORIES;
  protected readonly languages = SCRIPT_LANGUAGES;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly forbidden = signal(false);
  protected readonly cancelLink = computed(() =>
    this.id() ? `/scripts/${this.id()}` : '/scripts',
  );

  protected readonly form = new FormGroup({
    ...createBaseResourceControls(),
    category: new FormControl<ScriptCategory>('rest', {
      nonNullable: true,
      validators: Validators.required,
    }),
    language: new FormControl<string>(DEFAULT_LANGUAGE_BY_CATEGORY.rest, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(SCRIPT_LANGUAGE_PATTERN)],
    }),
    is_template: new FormControl(false, { nonNullable: true }),
    content: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(SCRIPT_LIMITS.contentMax)],
    }),
  });

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.scripts.getById(id),
  );
  protected readonly language = toSignal(this.form.controls.language.valueChanges, {
    initialValue: this.form.controls.language.value,
  });
  private readonly contentErrors = trackControlErrors(signal(this.form.controls.content));
  protected readonly contentError = computed(() =>
    controlErrorMessage(this.contentErrors(), {
      required: 'El código es obligatorio.',
      blank: 'El código es obligatorio.',
    }),
  );

  constructor() {
    effect(() => {
      const script = this.loader.value();
      if (!script) {
        return;
      }
      untracked(() => {
        this.form.reset({
          title: script.title,
          description: script.description ?? '',
          tags: script.tags,
          visibility: script.visibility,
          category: script.category,
          language: script.language,
          is_template: script.is_template,
          content: script.content,
        });
        if (!this.permissions.canEdit(script)) {
          this.forbidden.set(true);
          this.form.disable();
        }
      });
    });

    // Al crear, sugiere el lenguaje de la categoría mientras el usuario no lo elija.
    this.form.controls.category.valueChanges.pipe(takeUntilDestroyed()).subscribe((category) => {
      if (!this.id() && this.form.controls.language.pristine) {
        this.form.controls.language.setValue(DEFAULT_LANGUAGE_BY_CATEGORY[category]);
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
    }
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
    const payload: ScriptInput = {
      ...toBaseResourceInput(value),
      category: value.category,
      language: value.language,
      is_template: value.is_template,
      content: value.content,
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.id();
      const saved = id
        ? await this.scripts.update(id, payload)
        : await this.scripts.create(payload);
      this.form.markAsPristine();
      this.notifications.success(id ? 'Script actualizado.' : 'Script creado.');
      await this.router.navigate(['/scripts', saved.id]);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
