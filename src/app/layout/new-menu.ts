import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResourceType } from '../core/models';
import { RESOURCE_PATHS } from '../core/routing/app-paths';
import { Icon, IconName } from '../shared/ui/icon/icon';

interface NewMenuItem {
  type: ResourceType;
  label: string;
  icon: IconName;
}

const NEW_ITEMS: readonly NewMenuItem[] = [
  { type: 'script', label: 'Script o plantilla', icon: 'code' },
  { type: 'lesson', label: 'Lección aprendida', icon: 'lightbulb' },
  { type: 'note', label: 'Nota técnica', icon: 'note' },
  { type: 'manual', label: 'Manual o documento', icon: 'book' },
  { type: 'service', label: 'Servicio (REST/SOAP)', icon: 'plug' },
  { type: 'database', label: 'Conexión a base de datos', icon: 'database' },
];

/** Botón "Nuevo" de la barra superior: crea cualquier recurso sin entrar antes al módulo. */
@Component({
  selector: 'app-new-menu',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close(true)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="btn btn-primary h-9 gap-1 px-3"
      (click)="toggle()"
      aria-haspopup="menu"
      aria-controls="new-menu"
      aria-label="Nuevo recurso"
      [attr.aria-expanded]="open()"
    >
      <app-icon name="plus" iconClass="size-4" />
      <span class="hidden sm:inline" aria-hidden="true">Nuevo</span>
    </button>

    @if (open()) {
      <div
        id="new-menu"
        role="menu"
        aria-label="Crear nuevo recurso"
        class="card absolute end-0 z-30 mt-2 w-60 p-1 shadow-lg"
      >
        @for (item of items; track item.type) {
          <a
            role="menuitem"
            [routerLink]="paths[item.type] + '/new'"
            class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
            (click)="close()"
            (keydown.arrowdown)="moveFocus($event, 1)"
            (keydown.arrowup)="moveFocus($event, -1)"
          >
            <app-icon [name]="item.icon" iconClass="size-4 text-indigo-600 dark:text-indigo-400" />
            {{ item.label }}
          </a>
        }
      </div>
    }
  `,
})
export class NewMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly items = NEW_ITEMS;
  protected readonly paths = RESOURCE_PATHS;
  protected readonly open = signal(false);

  constructor() {
    // Al abrir, el foco pasa al primer elemento del menú.
    afterRenderEffect(() => {
      if (this.open()) {
        this.menuItems()[0]?.focus();
      }
    });
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected close(restoreFocus = false): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (restoreFocus) {
      this.trigger().nativeElement.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected moveFocus(event: Event, step: number): void {
    event.preventDefault();
    const items = this.menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + step + items.length) % items.length]?.focus();
  }

  private menuItems(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }
}
