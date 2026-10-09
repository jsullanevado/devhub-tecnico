import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { THEME_LABELS, ThemeMode, ThemeService } from '../../../core/theme/theme.service';
import { Icon, IconName } from '../icon/icon';

const MODE_ICON: Record<ThemeMode, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' };

@Component({
  selector: 'app-theme-toggle',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="btn-icon"
      (click)="theme.cycle()"
      [attr.aria-label]="label()"
      [title]="label()"
    >
      <app-icon [name]="icon()" />
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
  protected readonly icon = computed(() => MODE_ICON[this.theme.mode()]);
  protected readonly label = computed(
    () =>
      `Tema ${THEME_LABELS[this.theme.mode()]}. Cambiar a tema ${THEME_LABELS[this.theme.nextMode()]}`,
  );
}
