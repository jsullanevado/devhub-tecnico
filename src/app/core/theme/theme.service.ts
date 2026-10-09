import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Clave compartida con el script inline de index.html (evita el parpadeo inicial). */
export const THEME_STORAGE_KEY = 'devhub.theme';

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: 'claro',
  dark: 'oscuro',
  system: 'del sistema',
};

/**
 * Tema claro/oscuro/sistema. Persiste en localStorage, sigue los cambios del
 * sistema operativo y se sincroniza entre pestañas.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly media = this.window?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

  private readonly systemDark = signal(this.media?.matches ?? false);
  private readonly _mode = signal<ThemeMode>(this.readStoredMode());

  readonly mode = this._mode.asReadonly();
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this._mode();
    return mode === 'system' ? (this.systemDark() ? 'dark' : 'light') : mode;
  });
  readonly nextMode = computed(() => MODES[(MODES.indexOf(this._mode()) + 1) % MODES.length]);

  constructor() {
    this.media?.addEventListener('change', (event) => this.systemDark.set(event.matches));
    this.window?.addEventListener('storage', (event) => {
      if (event.key === THEME_STORAGE_KEY) {
        this._mode.set(toThemeMode(event.newValue));
      }
    });

    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.resolved() === 'dark');
    });
    effect(() => this.persist(this._mode()));
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  cycle(): void {
    this._mode.set(this.nextMode());
  }

  private readStoredMode(): ThemeMode {
    try {
      return toThemeMode(this.window?.localStorage.getItem(THEME_STORAGE_KEY) ?? null);
    } catch {
      return 'system';
    }
  }

  private persist(mode: ThemeMode): void {
    try {
      this.window?.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Almacenamiento bloqueado (modo privado, políticas): el tema funciona sin persistir.
    }
  }
}

function toThemeMode(value: string | null): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}
