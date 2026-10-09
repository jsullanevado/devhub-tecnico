import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { APP_PATHS } from '../../core/routing/app-paths';
import { visibleSections } from '../../layout/navigation';
import { Icon } from '../../shared/ui/icon/icon';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl">
      <h1 class="text-2xl font-semibold">Hola{{ name() ? ', ' + name() : '' }}</h1>
      <p class="mt-1 text-slate-600 dark:text-slate-400">
        Base de conocimiento técnico de tu equipo. Pulsa <kbd class="kbd">Ctrl K</kbd> o
        <kbd class="kbd">/</kbd> para buscar.
      </p>

      <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (item of modules(); track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              class="card block h-full p-5 transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:border-indigo-700"
            >
              <app-icon
                [name]="item.icon"
                iconClass="size-6 text-indigo-600 dark:text-indigo-400"
              />
              <h2 class="mt-3 font-medium">{{ item.label }}</h2>
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{{ item.description }}</p>
            </a>
          </li>
        }
      </ul>
    </div>
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthService);

  protected readonly name = computed(() => {
    const profile = this.auth.profile();
    return profile?.full_name?.split(' ')[0] || profile?.username || '';
  });
  protected readonly modules = computed(() =>
    visibleSections(this.auth.isAdmin())
      .flatMap((section) => section.items)
      .filter((item) => item.path !== APP_PATHS.home),
  );
}
