import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BaseResource } from '../../core/models';
import { TagList, VisibilityBadge } from '../ui/badges/badges';
import { authorName } from './author-name';

/** Autor, fechas, visibilidad y etiquetas de un recurso (vista de detalle). */
@Component({
  selector: 'app-resource-meta',
  imports: [DatePipe, VisibilityBadge, TagList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-3' },
  template: `
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-400"
    >
      <ng-content />
      <app-visibility-badge [visibility]="resource().visibility" />
      <span
        >Por
        <strong class="font-medium text-slate-800 dark:text-slate-200">{{ author() }}</strong></span
      >
      <span>
        Actualizado
        <time [attr.datetime]="resource().updated_at">{{
          resource().updated_at | date: 'medium'
        }}</time>
      </span>
    </div>
    <app-tag-list [tags]="resource().tags" [linkTo]="tagLink()" />
  `,
})
export class ResourceMeta {
  readonly resource = input.required<BaseResource>();
  /** Listado al que llevan las etiquetas (filtrado por etiqueta). */
  readonly tagLink = input<string>();
  protected readonly author = computed(() => authorName(this.resource().author));
}
