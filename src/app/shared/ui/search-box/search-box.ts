import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { Icon } from '../icon/icon';

const SEARCH_DEBOUNCE_MS = 300;

/** Campo de búsqueda con debounce: emite cuando el usuario deja de escribir. */
@Component({
  selector: 'app-search-box',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <!-- El posicionamiento va en el host del icono: si fuera en el <svg>, el host
         inline seguiría ocupando una línea y empujaría el campo hacia abajo. -->
    <app-icon
      name="search"
      class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
      iconClass="size-4"
    />
    <input
      type="search"
      class="input ps-9"
      [value]="value()"
      [placeholder]="placeholder()"
      [attr.aria-label]="label()"
      maxlength="200"
      autocomplete="off"
      (input)="onInput($event)"
    />
  `,
})
export class SearchBox {
  readonly value = input('');
  readonly placeholder = input('Buscar…');
  readonly label = input('Buscar');
  readonly valueChange = output<string>();

  protected readonly typed$ = new Subject<string>();

  constructor() {
    this.typed$
      .pipe(
        map((value) => value.trim()),
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((value) => this.valueChange.emit(value));
  }

  protected onInput(event: Event): void {
    this.typed$.next((event.target as HTMLInputElement).value);
  }
}
