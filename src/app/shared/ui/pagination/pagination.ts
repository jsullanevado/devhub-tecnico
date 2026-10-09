import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

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
        <p class="text-slate-600 dark:text-slate-400">
          Mostrando {{ from() }}–{{ to() }} de {{ total() }}
        </p>
        @if (pageCount() > 1) {
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn btn-secondary px-3"
              [disabled]="page() <= 1"
              (click)="pageChange.emit(page() - 1)"
              aria-label="Página anterior"
            >
              <app-icon name="chevron-left" iconClass="size-4" />
            </button>
            <span aria-current="page">Página {{ page() }} de {{ pageCount() }}</span>
            <button
              type="button"
              class="btn btn-secondary px-3"
              [disabled]="page() >= pageCount()"
              (click)="pageChange.emit(page() + 1)"
              aria-label="Página siguiente"
            >
              <app-icon name="chevron-right" iconClass="size-4" />
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
  readonly pageChange = output<number>();

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
  protected readonly from = computed(() =>
    Math.min(this.total(), (this.page() - 1) * this.pageSize() + 1),
  );
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
}
