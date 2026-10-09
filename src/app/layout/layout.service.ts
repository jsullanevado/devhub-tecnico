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

  openSearch(): void {
    this.searchOpen.set(true);
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }

  toggleSearch(): void {
    this.searchOpen.update((open) => !open);
  }
}
