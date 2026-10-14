import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

/** Página o hueco ("…") en la numeración. */
type PageItem = number | 'gap-start' | 'gap-end';

/**
 * Paginación: «Mostrando a–b de n», números de página (con «…» si hay muchas), primera,
 * anterior, siguiente y última. Con pageSizes, además, selector de filas por página.
 */
@Component({
  selector: 'app-pagination',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <nav
        aria-label="Paginación"
        class="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row"
      >
        <div class="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-400">
          <p>Mostrando {{ from() }}–{{ to() }} de {{ total() }}</p>
          @if (pageSizes().length) {
            <label class="flex items-center gap-2">
              Filas por página
              <select
                class="input w-auto py-1"
                [value]="pageSize()"
                (change)="pageSizeChange.emit(+$any($event.target).value)"
              >
                @for (size of pageSizes(); track size) {
                  <option [value]="size" [selected]="size === pageSize()">{{ size }}</option>
                }
              </select>
            </label>
          }
        </div>
        @if (pageCount() > 1) {
          <div class="flex flex-wrap items-center gap-1">
            <button
              type="button"
              class="btn btn-secondary px-2"
              [disabled]="page() <= 1"
              (click)="pageChange.emit(1)"
              aria-label="Primera página"
              title="Primera página"
            >
              <app-icon name="chevron-left" iconClass="size-4" /><app-icon
                name="chevron-left"
                iconClass="-ms-2.5 size-4"
              />
            </button>
            <button
              type="button"
              class="btn btn-secondary px-2"
              [disabled]="page() <= 1"
              (click)="pageChange.emit(page() - 1)"
              aria-label="Página anterior"
              title="Página anterior"
            >
              <app-icon name="chevron-left" iconClass="size-4" />
            </button>
            @for (item of items(); track item) {
              @if (item === 'gap-start' || item === 'gap-end') {
                <span class="px-1 text-slate-400" aria-hidden="true">…</span>
              } @else if (item === page()) {
                <span
                  class="min-w-9 rounded-lg bg-indigo-600 px-2 py-1.5 text-center font-semibold text-white"
                  aria-current="page"
                  >{{ item }}</span
                >
              } @else {
                <button
                  type="button"
                  class="btn btn-secondary min-w-9 px-2"
                  (click)="pageChange.emit(item)"
                  [attr.aria-label]="'Página ' + item"
                >
                  {{ item }}
                </button>
              }
            }
            <button
              type="button"
              class="btn btn-secondary px-2"
              [disabled]="page() >= pageCount()"
              (click)="pageChange.emit(page() + 1)"
              aria-label="Página siguiente"
              title="Página siguiente"
            >
              <app-icon name="chevron-right" iconClass="size-4" />
            </button>
            <button
              type="button"
              class="btn btn-secondary px-2"
              [disabled]="page() >= pageCount()"
              (click)="pageChange.emit(pageCount())"
              aria-label="Última página"
              title="Última página"
            >
              <app-icon name="chevron-right" iconClass="size-4" /><app-icon
                name="chevron-right"
                iconClass="-ms-2.5 size-4"
              />
            </button>
          </div>
        }
      </nav>
    }
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  /** Opciones de «Filas por página»; vacío = sin selector. */
  readonly pageSizes = input<readonly number[]>([]);
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
  protected readonly from = computed(() =>
    Math.min(this.total(), (this.page() - 1) * this.pageSize() + 1),
  );
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));

  /** 1 … 4 5 [6] 7 8 … 52: primera, última y dos a cada lado de la actual. */
  protected readonly items = computed<PageItem[]>(() => {
    const last = this.pageCount();
    const current = Math.min(Math.max(this.page(), 1), last);
    if (last <= 9) {
      return Array.from({ length: last }, (_, i) => i + 1);
    }
    const start = Math.max(2, Math.min(current - 2, last - 5));
    const end = Math.min(last - 1, Math.max(current + 2, 6));
    const items: PageItem[] = [1];
    if (start > 2) items.push('gap-start');
    for (let p = start; p <= end; p++) items.push(p);
    if (end < last - 1) items.push('gap-end');
    items.push(last);
    return items;
  });
}
