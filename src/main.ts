import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { AppError } from './app/core/errors/app-error';

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  console.error(error);
  renderFatalError(error);
});

/** Pantalla mínima si la app no puede arrancar (p. ej. Supabase sin configurar). */
function renderFatalError(error: unknown): void {
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.className =
    'mx-4 mt-24 max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-red-800 sm:mx-auto dark:border-red-900 dark:bg-red-950 dark:text-red-200';

  const title = document.createElement('h1');
  title.className = 'text-lg font-semibold';
  title.textContent = 'No se pudo iniciar DevHub Técnico';

  const message = document.createElement('p');
  message.className = 'mt-2 text-sm';
  message.textContent =
    error instanceof AppError && error.code === 'config'
      ? error.message
      : 'Ocurrió un error al cargar la aplicación. Recarga la página o contacta con el administrador.';

  box.append(title, message);
  document.body.replaceChildren(box);
}
