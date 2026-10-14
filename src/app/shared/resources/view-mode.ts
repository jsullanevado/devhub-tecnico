import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  InjectionToken,
  input,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { Icon } from '../ui/icon/icon';

export type ViewMode = 'cards' | 'list';

const STORAGE_PREFIX = 'devhub.viewMode.';

/** Vista elegida (tarjetas o lista) por módulo; se recuerda en este equipo. */
@Injectable({ providedIn: 'root' })
export class ViewModeStore {
  private readonly modes = new Map<string, WritableSignal<ViewMode>>();

  mode(key: string): WritableSignal<ViewMode> {
    let mode = this.modes.get(key);
    if (!mode) {
      mode = signal(read(key));
      this.modes.set(key, mode);
    }
    return mode;
  }

  set(key: string, value: ViewMode): void {
    this.mode(key).set(value);
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch {
      // Sin almacenamiento: la elección dura hasta cerrar la app.
    }
  }
}

function read(key: string): ViewMode {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

/** Vista del listado actual, para que las tarjetas proyectadas sepan cómo pintarse. */
export const LIST_LAYOUT = new InjectionToken<Signal<ViewMode>>('LIST_LAYOUT');

/** Botones "Tarjetas / Lista" de un módulo. */
@Component({
  selector: 'app-view-toggle',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let current = store.mode(viewKey())();
    <div
      class="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700"
      role="group"
      aria-label="Vista"
    >
      <button
        type="button"
        class="flex items-center gap-1 rounded px-2 py-1 text-sm"
        [class]="current === 'cards' ? activeClass : idleClass"
        [attr.aria-pressed]="current === 'cards'"
        title="Ver como tarjetas"
        (click)="store.set(viewKey(), 'cards')"
      >
        <app-icon name="grid" iconClass="size-4" /> Tarjetas
      </button>
      <button
        type="button"
        class="flex items-center gap-1 rounded px-2 py-1 text-sm"
        [class]="current === 'list' ? activeClass : idleClass"
        [attr.aria-pressed]="current === 'list'"
        title="Ver como lista"
        (click)="store.set(viewKey(), 'list')"
      >
        <app-icon name="menu" iconClass="size-4" /> Lista
      </button>
    </div>
  `,
})
export class ViewToggle {
  readonly viewKey = input.required<string>();
  protected readonly store = inject(ViewModeStore);
  protected readonly activeClass = 'bg-indigo-600 text-white dark:bg-indigo-500';
  protected readonly idleClass =
    'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
}
