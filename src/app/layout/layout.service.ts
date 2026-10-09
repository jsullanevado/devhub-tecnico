import { Injectable, signal } from '@angular/core';

/** Estado de la interfaz del layout (proveído en Shell). */
@Injectable()
export class LayoutService {
  readonly sidebarOpen = signal(false);
  readonly searchOpen = signal(false);

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  /** Texto con el que se abrirá el buscador (p. ej. al pulsar una etiqueta); se consume al abrir. */
  private searchSeed: string | null = null;

  openSearch(seed?: string): void {
    this.searchSeed = seed?.trim() || null;
    this.searchOpen.set(true);
  }

  consumeSearchSeed(): string | null {
    const seed = this.searchSeed;
    this.searchSeed = null;
    return seed;
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }

  toggleSearch(): void {
    this.searchOpen.update((open) => !open);
  }
}
