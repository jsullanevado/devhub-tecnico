import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('usa "system" si no hay preferencia guardada', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.mode()).toBe('system');
  });

  it('restaura la preferencia guardada', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignora valores guardados no válidos', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '<script>');
    expect(TestBed.inject(ThemeService).mode()).toBe('system');
  });

  it('alterna claro → oscuro → sistema y persiste', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const service = TestBed.inject(ThemeService);

    service.cycle();
    TestBed.tick();
    expect(service.mode()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    service.cycle();
    TestBed.tick();
    expect(service.mode()).toBe('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});
