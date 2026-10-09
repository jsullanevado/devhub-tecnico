import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { AuthService } from '../core/auth/auth.service';
import { toAppError } from '../core/errors/error-mapper';
import { ConfirmService } from '../core/notifications/confirm.service';
import { NotificationService } from '../core/notifications/notification.service';
import { Icon } from '../shared/ui/icon/icon';

@Component({
  selector: 'app-user-menu',
  imports: [Icon],
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
      class="flex items-center gap-2 rounded-full p-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600 md:rounded-md md:pe-2 dark:hover:bg-slate-800"
      (click)="toggle()"
      aria-haspopup="menu"
      aria-controls="user-menu"
      [attr.aria-expanded]="open()"
    >
      <span
        class="flex size-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white"
        aria-hidden="true"
      >
        {{ initials() }}
      </span>
      <span class="hidden max-w-40 truncate text-sm font-medium md:block">{{ displayName() }}</span>
      <app-icon name="chevron-down" iconClass="hidden size-4 md:block" />
      <span class="sr-only">Menú de usuario</span>
    </button>

    @if (open()) {
      <div
        id="user-menu"
        role="menu"
        aria-label="Menú de usuario"
        class="card absolute end-0 z-30 mt-2 w-64 p-1 shadow-lg"
      >
        <div class="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <p class="truncate text-sm font-medium">{{ displayName() }}</p>
          <p class="truncate text-xs text-slate-500 dark:text-slate-400">{{ auth.email() }}</p>
          @if (auth.isAdmin()) {
            <span class="badge mt-2">Administrador</span>
          }
        </div>
        <button
          #firstItem
          type="button"
          role="menuitem"
          class="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none dark:text-red-400 dark:hover:bg-red-950/40 dark:focus-visible:bg-red-950/40"
          (click)="signOut()"
        >
          <app-icon name="logout" iconClass="size-4" />
          Cerrar sesión
        </button>
      </div>
    }
  `,
})
export class UserMenu {
  protected readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly notifications = inject(NotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly firstItem = viewChild<ElementRef<HTMLButtonElement>>('firstItem');

  protected readonly open = signal(false);
  protected readonly displayName = computed(() => {
    const profile = this.auth.profile();
    return profile?.full_name || profile?.username || this.auth.email() || 'Usuario';
  });
  protected readonly initials = computed(() =>
    this.displayName()
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join(''),
  );

  constructor() {
    // Al abrir, el foco pasa al primer elemento del menú.
    afterRenderEffect(() => this.firstItem()?.nativeElement.focus());
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

  protected async signOut(): Promise<void> {
    this.close();
    const confirmed = await this.confirm.ask({
      title: 'Cerrar sesión',
      message: 'Se cerrará tu sesión en este dispositivo.',
      confirmLabel: 'Cerrar sesión',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.auth.signOut();
      this.notifications.info('Sesión cerrada.');
    } catch (error) {
      this.notifications.error(toAppError(error).message);
    }
  }
}
