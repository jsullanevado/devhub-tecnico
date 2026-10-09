import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center"
    >
      <p class="text-5xl font-bold text-slate-400">404</p>
      <h1 class="mt-4 text-xl font-semibold">Página no encontrada</h1>
      <p class="mt-2 text-slate-600 dark:text-slate-400">La dirección no existe o fue movida.</p>
      <a
        routerLink="/"
        class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Volver al inicio
      </a>
    </main>
  `,
})
export class NotFound {}
