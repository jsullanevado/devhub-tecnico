import { expect, Page, test as base } from '@playwright/test';
import { mockSupabase, TEST_USER } from './supabase-mock';

type Fixtures = {
  /** Errores de consola y excepciones no capturadas durante la prueba. */
  consoleErrors: string[];
  favorites: Awaited<ReturnType<typeof mockSupabase>>;
};

/**
 * Cada prueba arranca con Supabase simulado y falla si la app emite errores
 * en consola o excepciones no capturadas.
 */
export const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
    expect(errors, 'La consola del navegador no debe tener errores').toEqual([]);
  },
  favorites: async ({ page }, use) => {
    await use(await mockSupabase(page));
  },
});

export { expect };

export async function login(page: Page, redirect = '/dashboard'): Promise<void> {
  await page.goto(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByLabel('Correo electrónico').fill(TEST_USER.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(new RegExp(`${redirect}$`));
}

/** En móvil el menú lateral está plegado: lo abre si hace falta. */
export async function openNavIfCollapsed(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Abrir menú de navegación' });
  if (await toggle.isVisible()) {
    await toggle.click();
  }
}
