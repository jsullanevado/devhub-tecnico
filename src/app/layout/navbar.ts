import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icon } from '../shared/ui/icon/icon';
import { ThemeToggle } from '../shared/ui/theme-toggle/theme-toggle';
import { LayoutService } from './layout.service';
import { NewMenu } from './new-menu';
import { UserMenu } from './user-menu';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

@Component({
  selector: 'app-navbar',
  imports: [Icon, NewMenu, ThemeToggle, UserMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/85"
    >
      <button
        type="button"
        class="btn-icon lg:hidden"
        (click)="layout.toggleSidebar()"
        aria-controls="app-sidebar"
        [attr.aria-expanded]="layout.sidebarOpen()"
        aria-label="Abrir menú de navegación"
      >
        <app-icon name="menu" />
      </button>

      <button
        type="button"
        class="flex h-9 max-w-md flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-500 hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
        (click)="layout.openSearch()"
        aria-haspopup="dialog"
        [attr.aria-keyshortcuts]="isMac ? 'Meta+K' : 'Control+K'"
      >
        <app-icon name="search" iconClass="size-4" />
        <span class="flex-1 truncate text-start">Buscar en DevHub…</span>
        <kbd class="kbd hidden sm:inline">{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
      </button>

      <div class="ms-auto flex items-center gap-1">
        <app-new-menu class="me-1" />
        <app-theme-toggle />
        <app-user-menu />
      </div>
    </header>
  `,
})
export class Navbar {
  protected readonly layout = inject(LayoutService);
  protected readonly isMac = IS_MAC;
}
