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
import { NotesService } from '../../core/data/notes.service';
import { toAppError } from '../../core/errors/error-mapper';
import { NOTE_CATEGORIES, NOTE_LIMITS, NoteCategory, NoteInput } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  createBaseResourceControls,
  ResourceBaseFields,
  toBaseResourceInput,
} from '../../shared/forms/resource-base-fields';
import { SelectField } from '../../shared/forms/select-field';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import { notBlank } from '../../shared/forms/validators';
import { MarkdownField } from '../../shared/markdown/markdown-field';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { Alert } from '../../shared/ui/alert/alert';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';

/** Alta y edición de notas técnicas. */
@Component({
  selector: 'app-note-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    LoadState,
    ResourceBaseFields,
    SelectField,
    MarkdownField,
    Alert,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="mx-auto max-w-4xl">
      <app-page-header
        [title]="id() ? 'Editar nota' : 'Nueva nota'"
        [backLink]="cancelLink()"
        backLabel="Cancelar"
      />
      <app-load-state [state]="loader.state()" backLink="/notes">
        @if (forbidden()) {
          <app-alert type="warning" class="mt-6"
            >Solo el propietario puede editar esta nota.</app-alert
          >
        }
        @if (error(); as message) {
          <app-alert type="error" class="mt-6">{{ message }}</app-alert>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-6" novalidate>
          <section class="card p-5">
            <app-resource-base-fields [controls]="form.controls" idPrefix="note" />
          </section>

          <section class="card space-y-4 p-5">
            <div class="sm:w-1/2">
              <app-select-field
                label="Categoría"
                fieldId="note-category"
                [control]="form.controls.category"
                [options]="categories"
              />
            </div>
            <app-markdown-field
              label="Contenido"
              fieldId="note-content"
              [rows]="18"
              [maxlength]="limits.contentMax"
              hint="Markdown. Para enlazar otra nota: [Título](/notes/<id>) o «Copiar enlace wiki» en su detalle."
              [control]="form.controls.content"
            />
          </section>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <a [routerLink]="cancelLink()" class="btn btn-secondary">Cancelar</a>
            <button type="submit" class="btn btn-primary" [disabled]="saving() || forbidden()">
              @if (saving()) {
                <app-spinner size="sm" label="Guardando…" />
              }
              {{ id() ? 'Guardar cambios' : 'Crear nota' }}
            </button>
          </div>
        </form>
      </app-load-state>
    </div>
  `,
})
export class NoteFormPage implements HasUnsavedChanges {
  readonly id = input<string>();

  private readonly notes = inject(NotesService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly permissions = inject(ResourcePermissions);

  protected readonly limits = NOTE_LIMITS;
  protected readonly categories = NOTE_CATEGORIES;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly forbidden = signal(false);
  protected readonly cancelLink = computed(() => (this.id() ? `/notes/${this.id()}` : '/notes'));

  protected readonly form = new FormGroup({
    ...createBaseResourceControls(),
    category: new FormControl<NoteCategory>('general', { nonNullable: true }),
    content: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(NOTE_LIMITS.contentMax)],
    }),
  });

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.notes.getById(id),
  );

  constructor() {
    effect(() => {
      const note = this.loader.value();
      if (!note) {
        return;
      }
      untracked(() => {
        this.form.reset({
          title: note.title,
          description: note.description ?? '',
          tags: note.tags,
          visibility: note.visibility,
          category: note.category,
          content: note.content,
        });
        if (!this.permissions.canEdit(note)) {
          this.forbidden.set(true);
          this.form.disable();
        }
      });
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
    const payload: NoteInput = {
      ...toBaseResourceInput(value),
      category: value.category,
      content: value.content,
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.id();
      const saved = id ? await this.notes.update(id, payload) : await this.notes.create(payload);
      this.form.markAsPristine();
      this.notifications.success(id ? 'Nota actualizada.' : 'Nota creada.');
      await this.router.navigate(['/notes', saved.id]);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
