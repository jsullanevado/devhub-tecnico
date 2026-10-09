import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { LayoutService } from './layout.service';
import { Navbar } from './navbar';
import { SearchPalette } from './search-palette';
import { Sidebar } from './sidebar';

/** Layout de las rutas privadas: sidebar + navbar + contenido + buscador global. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, Navbar, SearchPalette],
  providers: [LayoutService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    <button
      type="button"
      class="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50"
      (click)="focusMain()"
    >
      Saltar al contenido
    </button>
    <div class="flex min-h-screen">
      <app-sidebar />
      <div class="flex min-w-0 flex-1 flex-col">
        <app-navbar />
        <main
          #main
          id="main-content"
          tabindex="-1"
          class="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8"
        >
          <router-outlet />
        </main>
      </div>
    </div>
    <app-search-palette />
  `,
})
export class Shell {
  private readonly layout = inject(LayoutService);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.layout.closeSidebar());
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.layout.toggleSearch();
    } else if (event.key === '/' && !this.layout.searchOpen() && !isEditable(event.target)) {
      event.preventDefault();
      this.layout.openSearch();
    }
  }

  protected focusMain(): void {
    this.main().nativeElement.focus();
  }
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
