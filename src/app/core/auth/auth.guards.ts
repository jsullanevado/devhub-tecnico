import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { APP_PATHS } from '../routing/app-paths';
import { AuthService } from './auth.service';

/**
 * Rutas privadas. canMatch evita además descargar los chunks lazy sin sesión.
 * Es una ayuda de navegación: la protección real de los datos es RLS.
 */
export const authGuard: CanMatchFn = async (_route, segments) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();

  if (auth.isAuthenticated()) {
    return true;
  }
  const target = '/' + segments.map((segment) => segment.path).join('/');
  return router.createUrlTree([APP_PATHS.login], {
    queryParams: target !== '/' ? { redirect: target } : {},
  });
};

/** Pantallas de login/registro: si ya hay sesión, ir al inicio. */
export const guestGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.isAuthenticated() ? router.createUrlTree([APP_PATHS.home]) : true;
};

/** Evita redirecciones abiertas: solo rutas internas absolutas y fuera de /auth. */
export function sanitizeRedirect(
  url: string | null | undefined,
  fallback: string = APP_PATHS.home,
): string {
  if (
    !url ||
    !url.startsWith('/') ||
    url.startsWith('//') ||
    url.startsWith('/\\') ||
    url.startsWith('/auth')
  ) {
    return fallback;
  }
  return url;
}
