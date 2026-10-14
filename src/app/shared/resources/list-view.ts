import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Alert } from '../ui/alert/alert';
import { EmptyState } from '../ui/empty-state/empty-state';
import { Pagination } from '../ui/pagination/pagination';
import { Spinner } from '../ui/spinner/spinner';
import { LIST_LAYOUT, ViewModeStore } from './view-mode';

/**
 * Estados de un listado: carga inicial, error con reintento, vacío (distinto si
 * hay filtros), resultados (contenido proyectado) y paginación.
 */
@Component({
  selector: 'app-list-view',
  imports: [Alert, EmptyState, Pagination, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  // Las tarjetas proyectadas leen la vista elegida (tarjetas o lista).
  providers: [{ provide: LIST_LAYOUT, useFactory: () => inject(ListView).layout }],
  template: `
    @if (error(); as message) {
      <app-alert type="error">
        {{ message }}
        <button type="button" class="link ms-2" (click)="retry.emit()">Reintentar</button>
      </app-alert>
    } @else if (loading() && total() === null) {
      <div class="flex justify-center py-16">
        <app-spinner size="lg" />
      </div>
    } @else if (total() === 0) {
      @if (hasFilters()) {
        <app-empty-state
          icon="search"
          title="Sin resultados"
          message="Ningún elemento coincide con los filtros aplicados."
        >
          <button type="button" class="btn btn-secondary" (click)="clearFilters.emit()">
            Limpiar filtros
          </button>
        </app-empty-state>
      } @else {
        <app-empty-state [title]="emptyTitle()" [message]="emptyMessage()">
          <ng-content select="[empty-action]" />
        </app-empty-state>
      }
    }

    <div
      [class.hidden]="!!error() || !total()"
      [class.opacity-60]="loading()"
      class="group/list transition-opacity"
      [attr.data-layout]="layout()"
      [attr.aria-busy]="loading()"
    >
      <ng-content />
      <div class="mt-6">
        <app-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [total]="total() ?? 0"
          (pageChange)="pageChange.emit($event)"
        />
      </div>
    </div>
  `,
})
export class ListView {
  readonly loading = input.required<boolean>();
  readonly error = input<string | null>(null);
  /** null mientras no hay una primera respuesta. */
  readonly total = input.required<number | null>();
  readonly page = input(1);
  readonly pageSize = input(12);
  readonly hasFilters = input(false);
  readonly emptyTitle = input('Todavía no hay elementos');
  readonly emptyMessage = input('');
  /** Módulo cuya vista (tarjetas o lista) se aplica; sin él, tarjetas. */
  readonly viewKey = input<string>();

  private readonly viewModes = inject(ViewModeStore);
  readonly layout = computed(() => {
    const key = this.viewKey();
    return key ? this.viewModes.mode(key)() : 'cards';
  });

  readonly retry = output<void>();
  readonly clearFilters = output<void>();
  readonly pageChange = output<number>();
}
