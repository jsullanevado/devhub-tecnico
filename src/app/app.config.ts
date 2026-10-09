import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import {
  ApplicationConfig,
  LOCALE_ID,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { PageTitleStrategy } from './core/routing/page-title.strategy';

// Fechas y números en español (DatePipe, etc.).
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es' },
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // Instancia AuthService al arrancar para escuchar Supabase Auth desde el primer momento
    // (enlaces de confirmación y recuperación de contraseña).
    provideAppInitializer(() => {
      inject(AuthService);
    }),
  ],
};
