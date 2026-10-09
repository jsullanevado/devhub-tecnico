import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BaseResource, ResourceType } from '../../core/models';
import { FavoriteButton } from '../favorites/favorite-button';
import { VisibilityBadge } from '../ui/badges/badges';
import { authorName } from './author-name';

/**
 * Tarjeta de listado. Toda la tarjeta es clicable a través del enlace del
 * título (patrón accesible: un único enlace con área ampliada). Las insignias
 * propias de cada módulo se proyectan; con `favoriteType` muestra la estrella.
 */
@Component({
  selector: 'app-resource-card',
  imports: [RouterLink, DatePipe, VisibilityBadge, FavoriteButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <article
      class="card relative flex h-full flex-col p-5 transition focus-within:ring-2 focus-within:ring-indigo-500 hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-700"
    >
      @if (favoriteType(); as type) {
        <app-favorite-button
          class="absolute end-3 top-3 z-10"
          [type]="type"
          [resourceId]="resource().id"
          [resourceTitle]="resource().title"
          [compact]="true"
        />
      }
      <div class="flex flex-wrap items-center gap-1.5" [class.pe-9]="favoriteType()">
        <ng-content />
        <app-visibility-badge [visibility]="resource().visibility" />
      </div>
      <h2 class="mt-3 font-medium">
        <a [routerLink]="link()" class="outline-none after:absolute after:inset-0">
          {{ resource().title }}
        </a>
      </h2>
      @if (resource().description) {
        <p class="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
          {{ resource().description }}
        </p>
      }
      @if (resource().tags.length) {
        <p class="mt-3 truncate text-xs text-indigo-700 dark:text-indigo-300">
          @for (tag of resource().tags; track tag) {
            <span class="me-1.5">#{{ tag }}</span>
          }
        </p>
      }
      <p class="mt-auto pt-4 text-xs text-slate-500 dark:text-slate-400">
        {{ author() }} · {{ resource().updated_at | date: 'mediumDate' }}
      </p>
    </article>
  `,
})
export class ResourceCard {
  readonly resource = input.required<BaseResource>();
  readonly link = input.required<string | readonly unknown[]>();
  readonly favoriteType = input<ResourceType>();

  protected author(): string {
    return authorName(this.resource().author);
  }
}
