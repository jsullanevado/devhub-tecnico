import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { FavoritesService } from '../../core/data/favorites.service';
import { ResourceType } from '../../core/models';

type FavoriteIds = Record<ResourceType, ReadonlySet<string>>;

const key = (type: ResourceType, id: string) => `${type}:${id}`;

/**
 * Estado de favoritos compartido por toda la interfaz (estrellas en listados,
 * detalles y página de favoritos). Se carga una vez por usuario, aplica los
 * cambios de forma optimista y los revierte si la base de datos los rechaza.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesState {
  private readonly service = inject(FavoritesService);
  private readonly auth = inject(AuthService);

  private readonly ids = signal<FavoriteIds | null>(null);
  private readonly pending = signal<ReadonlySet<string>>(new Set());
  private loading: Promise<void> | null = null;

  readonly loaded = computed(() => this.ids() !== null);

  constructor() {
    // Al cambiar de usuario (o cerrar sesión) se descarta el estado anterior.
    effect(() => {
      this.auth.userId();
      untracked(() => {
        this.ids.set(null);
        this.loading = null;
      });
    });
  }

  /** Carga los ids si aún no están; las llamadas concurrentes comparten la petición. */
  ensureLoaded(): Promise<void> {
    if (this.ids() || !this.auth.userId()) {
      return Promise.resolve();
    }
    this.loading ??= this.service
      .allIds()
      .then((ids) => this.ids.set(ids))
      .finally(() => (this.loading = null));
    return this.loading;
  }

  isFavorite(type: ResourceType, id: string): boolean {
    return this.ids()?.[type].has(id) ?? false;
  }

  isPending(type: ResourceType, id: string): boolean {
    return this.pending().has(key(type, id));
  }

  /** Marca o desmarca. Devuelve el estado final (true = es favorito). */
  async toggle(type: ResourceType, id: string): Promise<boolean> {
    await this.ensureLoaded();
    const next = !this.isFavorite(type, id);
    await this.apply(type, id, next);
    return next;
  }

  async remove(type: ResourceType, id: string): Promise<void> {
    await this.ensureLoaded();
    await this.apply(type, id, false);
  }

  private async apply(type: ResourceType, id: string, favorite: boolean): Promise<void> {
    const pendingKey = key(type, id);
    if (this.pending().has(pendingKey)) {
      return;
    }
    this.pending.update((current) => new Set(current).add(pendingKey));
    this.setLocal(type, id, favorite);
    try {
      await (favorite ? this.service.add(type, id) : this.service.remove(type, id));
    } catch (error) {
      this.setLocal(type, id, !favorite);
      throw error;
    } finally {
      this.pending.update((current) => {
        const copy = new Set(current);
        copy.delete(pendingKey);
        return copy;
      });
    }
  }

  private setLocal(type: ResourceType, id: string, favorite: boolean): void {
    this.ids.update((current) => {
      if (!current) {
        return current;
      }
      const set = new Set(current[type]);
      if (favorite) {
        set.add(id);
      } else {
        set.delete(id);
      }
      return { ...current, [type]: set };
    });
  }
}
