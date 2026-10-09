import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { APP_PATHS } from '../core/routing/app-paths';
import { Icon } from '../shared/ui/icon/icon';
import { LayoutService } from './layout.service';
import { visibleSections } from './navigation';

/** Fijo en escritorio (lg+); cajón deslizante con fondo en móvil. */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'layout.closeSidebar()' },
  template: `
    @if (layout.sidebarOpen()) {
      <div
        class="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
        (click)="layout.closeSidebar()"
        aria-hidden="true"
      ></div>
    }
    <div
      id="app-sidebar"
      class="fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e border-slate-200 bg-white transition-transform duration-200 lg:visible lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900"
      [class.-translate-x-full]="!layout.sidebarOpen()"
      [class.invisible]="!layout.sidebarOpen()"
    >
      <div class="flex h-16 shrink-0 items-center justify-between px-4">
        <a [routerLink]="home" class="flex items-center gap-2 rounded-md font-semibold">
          <app-icon name="code" iconClass="size-6 text-indigo-600 dark:text-indigo-400" />
          DevHub Técnico
        </a>
        <button
          type="button"
          class="btn-icon lg:hidden"
          (click)="layout.closeSidebar()"
          aria-label="Cerrar menú"
        >
          <app-icon name="x" />
        </button>
      </div>

      <nav aria-label="Navegación principal" class="flex-1 overflow-y-auto px-3 pb-6">
        @for (section of sections(); track section.id) {
          <p
            class="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
          >
            {{ section.label }}
          </p>
          <ul class="space-y-1">
            @for (item of section.items; track item.path) {
              <li>
                <a
                  [routerLink]="item.path"
                  routerLinkActive="is-active"
                  ariaCurrentWhenActive="page"
                  class="nav-link"
                >
                  <app-icon [name]="item.icon" />
                  {{ item.label }}
                </a>
              </li>
            }
          </ul>
        }
      </nav>
    </div>
  `,
})
export class Sidebar {
  protected readonly layout = inject(LayoutService);
  private readonly auth = inject(AuthService);
  protected readonly home = APP_PATHS.home;
  protected readonly sections = computed(() => visibleSections(this.auth.isAdmin()));
}
