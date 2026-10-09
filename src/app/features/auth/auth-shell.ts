import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Icon } from '../../shared/ui/icon/icon';
import { ThemeToggle } from '../../shared/ui/theme-toggle/theme-toggle';

/** Marco común de las pantallas públicas de autenticación. */
@Component({
  selector: 'app-auth-shell',
  imports: [RouterOutlet, Icon, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-screen flex-col">
      <header class="flex items-center justify-between px-4 py-4 sm:px-6">
        <span class="flex items-center gap-2 font-semibold">
          <app-icon name="code" iconClass="size-6 text-indigo-600 dark:text-indigo-400" />
          DevHub Técnico
        </span>
        <app-theme-toggle />
      </header>
      <main class="flex flex-1 items-start justify-center px-4 pt-4 pb-12 sm:items-center">
        <div class="card w-full max-w-md p-6 shadow-sm sm:p-8">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class AuthShell {}
