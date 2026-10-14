import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth-shell').then((m) => m.AuthShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        title: 'Iniciar sesión',
        canMatch: [guestGuard],
        loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        title: 'Crear cuenta',
        canMatch: [guestGuard],
        loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        title: 'Recuperar contraseña',
        canMatch: [guestGuard],
        loadComponent: () =>
          import('./features/auth/forgot-password.page').then((m) => m.ForgotPasswordPage),
      },
      {
        // Sin guard: se accede con la sesión temporal del enlace de recuperación.
        path: 'reset-password',
        title: 'Nueva contraseña',
        loadComponent: () =>
          import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage),
      },
    ],
  },
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Inicio',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'scripts',
        loadChildren: () =>
          import('./features/scripts/scripts.routes').then((m) => m.SCRIPTS_ROUTES),
      },
      {
        path: 'lessons',
        loadChildren: () =>
          import('./features/lessons/lessons.routes').then((m) => m.LESSONS_ROUTES),
      },
      {
        path: 'notes',
        loadChildren: () => import('./features/notes/notes.routes').then((m) => m.NOTES_ROUTES),
      },
      {
        path: 'manuals',
        loadChildren: () =>
          import('./features/manuals/manuals.routes').then((m) => m.MANUALS_ROUTES),
      },
      {
        path: 'services',
        loadChildren: () =>
          import('./features/services/services.routes').then((m) => m.SERVICES_ROUTES),
      },
      {
        path: 'databases',
        loadChildren: () =>
          import('./features/databases/databases.routes').then((m) => m.DATABASES_ROUTES),
      },
      {
        path: 'reports',
        title: 'Reportes',
        loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'bulk-import',
        title: 'Carga masiva',
        loadComponent: () =>
          import('./features/bulk-import/bulk-import.page').then((m) => m.BulkImportPage),
      },
      {
        path: 'flows',
        title: 'Flujos BPMN',
        loadComponent: () => import('./features/flows/flows.page').then((m) => m.FlowsPage),
      },
      {
        path: 'mdi',
        title: 'Generar MDI',
        loadComponent: () => import('./features/mdi/mdi.page').then((m) => m.MdiPage),
      },
      {
        path: 'tools',
        loadChildren: () => import('./features/tools/tools.routes').then((m) => m.TOOLS_ROUTES),
      },
      {
        path: 'favorites',
        title: 'Favoritos',
        loadComponent: () =>
          import('./features/favorites/favorites.page').then((m) => m.FavoritesPage),
      },
    ],
  },
  {
    path: '**',
    title: 'Página no encontrada',
    loadComponent: () => import('./shared/ui/not-found/not-found').then((m) => m.NotFound),
  },
];
