import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toAppError } from '../../core/errors/error-mapper';
import { ResourceType } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { Icon } from '../ui/icon/icon';
import { FavoritesState } from './favorites.state';

/** Estrella para marcar/desmarcar un recurso como favorito (botón de alternancia accesible). */
@Component({
  selector: 'app-favorite-button',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [class]="compact() ? 'btn-icon size-8' : 'btn btn-secondary'"
      [attr.aria-pressed]="active()"
      [attr.aria-label]="label()"
      [title]="label()"
      [disabled]="busy()"
      (click)="toggle($event)"
    >
      <app-icon
        name="star"
        [iconClass]="active() ? 'size-4 fill-amber-400 text-amber-500' : 'size-4'"
      />
      @if (!compact()) {
        {{ active() ? 'En favoritos' : 'Favorito' }}
      }
    </button>
  `,
})
export class FavoriteButton {
  readonly type = input.required<ResourceType>();
  readonly resourceId = input.required<string>();
  readonly resourceTitle = input('');
  readonly compact = input(false);

  private readonly favorites = inject(FavoritesState);
  private readonly notifications = inject(NotificationService);

  protected readonly active = computed(() =>
    this.favorites.isFavorite(this.type(), this.resourceId()),
  );
  protected readonly busy = computed(() =>
    this.favorites.isPending(this.type(), this.resourceId()),
  );
  protected readonly label = computed(() => {
    const target = this.resourceTitle() ? ` «${this.resourceTitle()}»` : '';
    return this.active() ? `Quitar${target} de favoritos` : `Añadir${target} a favoritos`;
  });

  constructor() {
    this.favorites.ensureLoaded().catch((error: unknown) => {
      console.warn('[DevHub] No se pudieron cargar los favoritos', toAppError(error));
    });
  }

  protected async toggle(event: Event): Promise<void> {
    // Dentro de una tarjeta enlazada: no debe navegar.
    event.preventDefault();
    event.stopPropagation();
    try {
      await this.favorites.toggle(this.type(), this.resourceId());
    } catch (error) {
      this.notifications.error(toAppError(error).message);
    }
  }
}
