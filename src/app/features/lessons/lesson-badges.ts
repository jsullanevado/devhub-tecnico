import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  LESSON_CATEGORIES,
  LESSON_SEVERITIES,
  LESSON_STATUSES,
  LessonSummary,
} from '../../core/models';
import { lessonLabel } from './lessons.codec';

const SEVERITY_CLASSES: Record<LessonSummary['severity'], string> = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  medium: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  high: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
};

const STATUS_CLASSES: Record<LessonSummary['status'], string> = {
  open: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  resolved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

/** Insignias de severidad, estado, categoría y tecnología de una lección. */
@Component({
  selector: 'app-lesson-badges',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <span class="badge" [class]="severityClass()">
      <span class="sr-only">Severidad:</span>{{ severity() }}
    </span>
    <span class="badge" [class]="statusClass()">{{ status() }}</span>
    <span class="badge">{{ category() }}</span>
    @if (lesson().technology) {
      <span class="badge font-mono">{{ lesson().technology }}</span>
    }
  `,
})
export class LessonBadges {
  readonly lesson = input.required<LessonSummary>();
  protected readonly severity = computed(() =>
    lessonLabel(LESSON_SEVERITIES, this.lesson().severity),
  );
  protected readonly status = computed(() => lessonLabel(LESSON_STATUSES, this.lesson().status));
  protected readonly category = computed(() =>
    lessonLabel(LESSON_CATEGORIES, this.lesson().category),
  );
  protected readonly severityClass = computed(() => SEVERITY_CLASSES[this.lesson().severity]);
  protected readonly statusClass = computed(() => STATUS_CLASSES[this.lesson().status]);
}
