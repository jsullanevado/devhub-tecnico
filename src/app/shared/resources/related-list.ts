import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BaseResource } from '../../core/models';

/** Recursos relacionados (comparten etiquetas) para navegar entre contenidos. */
@Component({
  selector: 'app-related-list',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <aside class="card p-5" [attr.aria-labelledby]="headingId()">
        <h2 [id]="headingId()" class="text-sm font-semibold">{{ heading() }}</h2>
        <ul class="mt-3 space-y-2">
          @for (item of items(); track item.id) {
            <li>
              <a [routerLink]="[basePath(), item.id]" class="link text-sm">{{ item.title }}</a>
            </li>
          }
        </ul>
      </aside>
    }
  `,
})
export class RelatedList {
  readonly items = input.required<readonly BaseResource[]>();
  readonly basePath = input.required<string>();
  readonly heading = input('Relacionados');
  readonly headingId = input('related-heading');
}
