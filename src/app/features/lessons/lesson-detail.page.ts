import { DatePipe } from '@angular/common';
import { FavoriteButton } from '../../shared/favorites/favorite-button';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LessonsService } from '../../core/data/lessons.service';
import { LessonLearned } from '../../core/models';
import { Markdown } from '../../shared/markdown/markdown';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { RelatedList } from '../../shared/resources/related-list';
import { ResourceDeletion } from '../../shared/resources/resource-deletion';
import { ResourceMeta } from '../../shared/resources/resource-meta';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { LessonBadges } from './lesson-badges';

@Component({
  selector: 'app-lesson-detail-page',
  imports: [
    FavoriteButton,
    RouterLink,
    DatePipe,
    LoadState,
    PageHeader,
    ResourceMeta,
    Markdown,
    RelatedList,
    LessonBadges,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl">
      <app-load-state [state]="loader.state()" backLink="/lessons">
        @if (loader.value(); as lesson) {
          <app-page-header
            [title]="lesson.title"
            backLink="/lessons"
            backLabel="Lecciones aprendidas"
          >
            <app-favorite-button
              type="lesson"
              [resourceId]="lesson.id"
              [resourceTitle]="lesson.title"
            />
            @if (permissions.canEdit(lesson)) {
              <a [routerLink]="['/lessons', lesson.id, 'edit']" class="btn btn-secondary">
                <app-icon name="pencil" iconClass="size-4" /> Editar
              </a>
            }
            @if (permissions.canDelete(lesson)) {
              <button
                type="button"
                class="btn btn-danger"
                [disabled]="deleting()"
                (click)="remove(lesson)"
              >
                <app-icon name="trash" iconClass="size-4" /> Eliminar
              </button>
            }
          </app-page-header>

          <app-resource-meta class="mt-4" [resource]="lesson" tagLink="/lessons">
            <app-lesson-badges [lesson]="lesson" />
            @if (lesson.occurred_on) {
              <span>Ocurrió el {{ lesson.occurred_on | date: 'longDate' }}</span>
            }
          </app-resource-meta>

          <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_16rem]">
            <div class="min-w-0 space-y-6">
              @if (lesson.description) {
                <p class="whitespace-pre-line text-slate-700 dark:text-slate-300">
                  {{ lesson.description }}
                </p>
              }
              <section class="card p-5" aria-labelledby="lesson-problem">
                <h2 id="lesson-problem" class="text-lg font-semibold">Problema</h2>
                <app-markdown class="mt-2" [content]="lesson.problem" />
              </section>
              @if (lesson.root_cause) {
                <section class="card p-5" aria-labelledby="lesson-cause">
                  <h2 id="lesson-cause" class="text-lg font-semibold">Causa raíz</h2>
                  <app-markdown class="mt-2" [content]="lesson.root_cause" />
                </section>
              }
              @if (lesson.solution) {
                <section class="card p-5" aria-labelledby="lesson-solution">
                  <h2 id="lesson-solution" class="text-lg font-semibold">Solución</h2>
                  <app-markdown class="mt-2" [content]="lesson.solution" />
                </section>
              }
              @if (lesson.conclusion) {
                <section class="card p-5" aria-labelledby="lesson-conclusion">
                  <h2 id="lesson-conclusion" class="text-lg font-semibold">Conclusiones</h2>
                  <app-markdown class="mt-2" [content]="lesson.conclusion" />
                </section>
              }
            </div>
            <app-related-list
              [items]="related.value() ?? []"
              basePath="/lessons"
              heading="Lecciones relacionadas"
            />
          </div>
        }
      </app-load-state>
    </div>
  `,
})
export class LessonDetailPage {
  readonly id = input.required<string>();

  private readonly lessons = inject(LessonsService);
  private readonly deletion = inject(ResourceDeletion);
  protected readonly permissions = inject(ResourcePermissions);

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.lessons.getById(id),
  );
  protected readonly related = createAsyncLoader(
    () => this.loader.value(),
    (lesson) => this.lessons.listRelated(lesson.id, lesson.tags),
  );
  protected readonly deleting = signal(false);

  constructor() {
    const title = inject(Title);
    effect(() => {
      const lesson = this.loader.value();
      if (lesson) {
        title.setTitle(`${lesson.title} · ${environment.appName}`);
      }
    });
  }

  protected async remove(lesson: LessonLearned): Promise<void> {
    this.deleting.set(true);
    await this.deletion.run({
      dialogTitle: 'Eliminar lección',
      resourceTitle: lesson.title,
      successMessage: 'Lección eliminada.',
      remove: () => this.lessons.delete(lesson.id),
      redirectTo: '/lessons',
    });
    this.deleting.set(false);
  }
}
