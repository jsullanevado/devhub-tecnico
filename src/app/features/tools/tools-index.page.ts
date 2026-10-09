import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { TOOLS } from './tools.config';

@Component({
  selector: 'app-tools-index-page',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl">
      <app-page-header
        title="Herramientas"
        description="Utilidades para desarrollo y pruebas. Se ejecutan en tu navegador y no guardan datos."
      />
      <ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (tool of tools; track tool.path) {
          <li>
            <a
              [routerLink]="tool.path"
              class="card block h-full p-5 transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:border-indigo-700"
            >
              <app-icon
                [name]="tool.icon"
                iconClass="size-6 text-indigo-600 dark:text-indigo-400"
              />
              <h2 class="mt-3 font-medium">{{ tool.title }}</h2>
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{{ tool.description }}</p>
            </a>
          </li>
        }
      </ul>
    </div>
  `,
})
export class ToolsIndexPage {
  protected readonly tools = TOOLS;
}
