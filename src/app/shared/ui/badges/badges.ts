import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Visibility } from '../../../core/models';

@Component({
  selector: 'app-visibility-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="badge"
      [class]="visibility() === 'public' ? publicClasses : ''"
      [title]="visibility() === 'public' ? 'Visible para todo el equipo' : 'Solo visible para ti'"
    >
      {{ visibility() === 'public' ? 'Público' : 'Privado' }}
    </span>
  `,
})
export class VisibilityBadge {
  protected readonly publicClasses =
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
  readonly visibility = input.required<Visibility>();
}

/** Lista de etiquetas; con `linkTo` cada etiqueta filtra el listado indicado. */
@Component({
  selector: 'app-tag-list',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tags().length) {
      <ul class="flex flex-wrap gap-1.5" aria-label="Etiquetas">
        @for (tag of tags(); track tag) {
          <li>
            @if (linkTo()) {
              <a
                class="badge hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                [routerLink]="linkTo()"
                [queryParams]="{ tags: tag }"
                >#{{ tag }}</a
              >
            } @else {
              <span class="badge">#{{ tag }}</span>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class TagList {
  readonly tags = input.required<readonly string[]>();
  readonly linkTo = input<string>();
}
