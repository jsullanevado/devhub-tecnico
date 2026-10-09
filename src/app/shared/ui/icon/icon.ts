import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Iconos de trazo (24×24, currentColor). Añadir aquí los nuevos que se necesiten.
const ICON_PATHS = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16',
  lightbulb:
    'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  note: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  book: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h6',
  wrench:
    'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM20 20l-4-4',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6L6 18',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  'chevron-down': 'M6 9l6 6 6-6',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  alert: 'M12 3l10 18H2zM12 10v4M12 17v.5',
  check: 'M5 12l5 5 9-10',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  'eye-off':
    'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM3 3l18 18',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  upload: 'M12 20V8M7 13l5-5 5 5M4 4h16',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z',
  'id-card':
    'M3 5h18v14H3zM7 10a2 2 0 1 0 4 0a2 2 0 0 0-4 0M6 16c.5-1.5 1.8-2 3-2s2.5.5 3 2M14 9h4M14 13h4',
  'credit-card': 'M3 6h18v12H3zM3 10h18M7 15h4',
  fingerprint:
    'M12 11v3M8 9a4 4 0 0 1 8 0v4c0 2-1 4-2 5M6 13V9a6 6 0 0 1 12 0M10 13v1c0 2-.5 3.5-1.5 5',
  'file-code': 'M7 3h7l5 5v13H7zM14 3v5h5M11 12l-2 2 2 2M15 12l2 2-2 2',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  plus: 'M12 5v14M5 12h14',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8a.5.5 0 1 0 0-.01',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
  key: 'M15 7a4 4 0 1 0-3.9 5L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 0 15 7zM16 7.5h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  terminal: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14M6 13l6 6 6-6',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Icono decorativo (aria-hidden). El texto accesible lo aporta el elemento que lo contiene. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      [attr.class]="iconClass()"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly iconClass = input('size-5');
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
}
