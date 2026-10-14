import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BaseResource, ResourceType } from '../../core/models';
import { FavoriteButton } from '../favorites/favorite-button';
import { VisibilityBadge } from '../ui/badges/badges';
import { authorName } from './author-name';
import { LIST_LAYOUT } from './view-mode';

/**
 * Tarjeta de listado. Toda la tarjeta es clicable a través del enlace del
 * título (patrón accesible: un único enlace con área ampliada). Las insignias
 * propias de cada módulo se proyectan; con `favoriteType` muestra la estrella.
 * Dentro de un listado en vista "lista" se pinta como una fila compacta.
 */
@Component({
  selector: 'app-resource-card',
  imports: [RouterLink, DatePipe, VisibilityBadge, FavoriteButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    @let list = isList();
    <article
      class="card relative flex transition focus-within:ring-2 focus-within:ring-indigo-500 hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-700"
      [class]="
        list
          ? 'flex-col gap-1.5 py-3 ps-4 pe-12 md:flex-row md:items-center md:gap-4'
          : 'h-full flex-col p-5'
      "
      [attr.data-layout]="list ? 'list' : 'cards'"
    >
      @if (favoriteType(); as type) {
        <app-favorite-button
          class="absolute end-3 z-10"
          [class]="list ? 'top-1/2 -translate-y-1/2' : 'top-3'"
          [type]="type"
          [resourceId]="resource().id"
          [resourceTitle]="resource().title"
          [compact]="true"
        />
      }
      <div class="min-w-0" [class]="list ? 'order-1 md:w-2/5 md:shrink-0' : 'order-2 mt-3'">
        <h2 class="font-medium wrap-anywhere" [class.truncate]="list">
          <a [routerLink]="link()" class="outline-none after:absolute after:inset-0">
            {{ resource().title }}
          </a>
        </h2>
        @if (resource().description) {
          <p
            class="mt-1 text-sm text-slate-600 dark:text-slate-400"
            [class]="list ? 'truncate' : 'line-clamp-2'"
          >
            {{ resource().description }}
          </p>
        }
      </div>
      <div
        class="flex min-w-0 flex-wrap items-center gap-1.5"
        [class]="list ? 'order-2 md:flex-1' : 'order-1'"
        [class.pe-9]="!list && favoriteType()"
      >
        <ng-content />
        <app-visibility-badge [visibility]="resource().visibility" />
      </div>
      @if (resource().tags.length) {
        <p
          class="truncate text-xs text-indigo-700 dark:text-indigo-300"
          [class]="list ? 'order-3 md:max-w-48' : 'order-3 mt-3'"
        >
          @for (tag of resource().tags; track tag) {
            <span class="me-1.5">#{{ tag }}</span>
          }
        </p>
      }
      <p
        class="order-4 text-xs text-slate-500 dark:text-slate-400"
        [class]="list ? 'md:shrink-0' : 'mt-auto pt-4'"
      >
        {{ author() }} · {{ resource().updated_at | date: 'mediumDate' }}
      </p>
    </article>
  `,
})
export class ResourceCard {
  readonly resource = input.required<BaseResource>();
  readonly link = input.required<string | readonly unknown[]>();
  readonly favoriteType = input<ResourceType>();

  private readonly layout = inject(LIST_LAYOUT, { optional: true });
  protected readonly isList = computed(() => this.layout?.() === 'list');

  protected author(): string {
    return authorName(this.resource().author);
  }
}
