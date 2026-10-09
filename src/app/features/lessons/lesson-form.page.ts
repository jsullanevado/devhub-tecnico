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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LessonsService } from '../../core/data/lessons.service';
import { toAppError } from '../../core/errors/error-mapper';
import {
  LESSON_CATEGORIES,
  LESSON_LIMITS,
  LESSON_SEVERITIES,
  LESSON_STATUSES,
  LessonCategory,
  LessonInput,
  LessonSeverity,
  LessonStatus,
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
import { notBlank, requiredWhen } from '../../shared/forms/validators';
import { MarkdownField } from '../../shared/markdown/markdown-field';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { Alert } from '../../shared/ui/alert/alert';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';

const longText = (...validators: ValidatorFn[]) =>
  new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(LESSON_LIMITS.textMax), ...validators],
  });

/** Alta y edición de lecciones aprendidas. */
@Component({
  selector: 'app-lesson-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
    LoadState,
    ResourceBaseFields,
    SelectField,
    TextField,
    MarkdownField,
    Alert,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="mx-auto max-w-4xl">
      <app-page-header
        [title]="id() ? 'Editar lección' : 'Registrar lección aprendida'"
        [backLink]="cancelLink()"
        backLabel="Cancelar"
      />
      <app-load-state [state]="loader.state()" backLink="/lessons">
        @if (forbidden()) {
          <app-alert type="warning" class="mt-6">
            Solo el propietario puede editar esta lección.
          </app-alert>
        }
        @if (error(); as message) {
          <app-alert type="error" class="mt-6">{{ message }}</app-alert>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="mt-6 space-y-6" novalidate>
          <section class="card p-5">
            <app-resource-base-fields [controls]="form.controls" idPrefix="lesson" />
          </section>

          <section class="card space-y-4 p-5" aria-labelledby="lesson-classification">
            <h2 id="lesson-classification" class="font-semibold">Clasificación</h2>
            <div class="grid gap-4 sm:grid-cols-3">
              <div>
                <app-select-field
                  label="Severidad"
                  fieldId="lesson-severity"
                  [control]="form.controls.severity"
                  [options]="severities"
                />
              </div>
              <div>
                <app-select-field
                  label="Estado"
                  fieldId="lesson-status"
                  [control]="form.controls.status"
                  [options]="statuses"
                />
              </div>
              <div>
                <app-select-field
                  label="Categoría"
                  fieldId="lesson-category"
                  [control]="form.controls.category"
                  [options]="categories"
                />
              </div>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <app-text-field
                  label="Tecnología"
                  fieldId="lesson-technology"
                  placeholder="p. ej. Oracle 19c, Spring Boot"
                  [optional]="true"
                  [maxlength]="limits.technologyMax"
                  [control]="form.controls.technology"
                />
              </div>
              <div>
                <app-text-field
                  label="Fecha de la incidencia"
                  fieldId="lesson-occurred-on"
                  type="date"
                  [optional]="true"
                  [control]="form.controls.occurred_on"
                />
              </div>
            </div>
          </section>

          <section class="card space-y-5 p-5" aria-labelledby="lesson-details">
            <h2 id="lesson-details" class="font-semibold">Detalle</h2>
            <app-markdown-field
              label="Problema"
              fieldId="lesson-problem"
              [rows]="6"
              [maxlength]="limits.textMax"
              hint="Qué ocurrió, síntomas, mensajes de error y alcance."
              [control]="form.controls.problem"
            />
            <app-markdown-field
              label="Causa raíz"
              fieldId="lesson-root-cause"
              [rows]="4"
              [optional]="true"
              [maxlength]="limits.textMax"
              [control]="form.controls.root_cause"
            />
            <app-markdown-field
              label="Solución"
              fieldId="lesson-solution"
              [rows]="5"
              [optional]="!isResolved()"
              [maxlength]="limits.textMax"
              hint="Obligatoria cuando el estado es «Resuelta»."
              [messages]="{ required: 'Una lección resuelta debe documentar la solución.' }"
              [control]="form.controls.solution"
            />
            <app-markdown-field
              label="Conclusiones"
              fieldId="lesson-conclusion"
              [rows]="4"
              [optional]="true"
              [maxlength]="limits.textMax"
              hint="Qué aprendimos y qué haremos distinto."
              [control]="form.controls.conclusion"
            />
          </section>

          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <a [routerLink]="cancelLink()" class="btn btn-secondary">Cancelar</a>
            <button type="submit" class="btn btn-primary" [disabled]="saving() || forbidden()">
              @if (saving()) {
                <app-spinner size="sm" label="Guardando…" />
              }
              {{ id() ? 'Guardar cambios' : 'Registrar lección' }}
            </button>
          </div>
        </form>
      </app-load-state>
    </div>
  `,
})
export class LessonFormPage implements HasUnsavedChanges {
  readonly id = input<string>();

  private readonly lessons = inject(LessonsService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly permissions = inject(ResourcePermissions);

  protected readonly limits = LESSON_LIMITS;
  protected readonly severities = LESSON_SEVERITIES;
  protected readonly statuses = LESSON_STATUSES;
  protected readonly categories = LESSON_CATEGORIES;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly forbidden = signal(false);
  protected readonly isResolved = signal(false);
  protected readonly cancelLink = computed(() =>
    this.id() ? `/lessons/${this.id()}` : '/lessons',
  );

  protected readonly form = new FormGroup({
    ...createBaseResourceControls(),
    severity: new FormControl<LessonSeverity>('medium', { nonNullable: true }),
    status: new FormControl<LessonStatus>('open', { nonNullable: true }),
    category: new FormControl<LessonCategory>('other', { nonNullable: true }),
    technology: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(LESSON_LIMITS.technologyMax),
    }),
    occurred_on: new FormControl('', { nonNullable: true }),
    problem: longText(Validators.required, notBlank),
    root_cause: longText(),
    solution: longText(requiredWhen('status', 'resolved')),
    conclusion: longText(),
  });

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.lessons.getById(id),
  );

  constructor() {
    effect(() => {
      const lesson = this.loader.value();
      if (!lesson) {
        return;
      }
      untracked(() => {
        this.form.reset({
          title: lesson.title,
          description: lesson.description ?? '',
          tags: lesson.tags,
          visibility: lesson.visibility,
          severity: lesson.severity,
          status: lesson.status,
          category: lesson.category,
          technology: lesson.technology ?? '',
          occurred_on: lesson.occurred_on ?? '',
          problem: lesson.problem,
          root_cause: lesson.root_cause ?? '',
          solution: lesson.solution ?? '',
          conclusion: lesson.conclusion ?? '',
        });
        if (!this.permissions.canEdit(lesson)) {
          this.forbidden.set(true);
          this.form.disable();
        }
      });
    });

    // La obligatoriedad de la solución depende del estado.
    this.form.controls.status.valueChanges.pipe(takeUntilDestroyed()).subscribe((status) => {
      this.isResolved.set(status === 'resolved');
      this.form.controls.solution.updateValueAndValidity();
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
    const optional = (text: string) => text.trim() || null;
    const payload: LessonInput = {
      ...toBaseResourceInput(value),
      severity: value.severity,
      status: value.status,
      category: value.category,
      technology: optional(value.technology),
      occurred_on: value.occurred_on || null,
      problem: value.problem.trim(),
      root_cause: optional(value.root_cause),
      solution: optional(value.solution),
      conclusion: optional(value.conclusion),
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.id();
      const saved = id
        ? await this.lessons.update(id, payload)
        : await this.lessons.create(payload);
      this.form.markAsPristine();
      this.notifications.success(id ? 'Lección actualizada.' : 'Lección registrada.');
      await this.router.navigate(['/lessons', saved.id]);
    } catch (error) {
      this.error.set(toAppError(error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
