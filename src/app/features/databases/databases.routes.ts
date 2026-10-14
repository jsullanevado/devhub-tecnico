import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const DATABASES_ROUTES: Routes = [
  {
    path: '',
    title: 'Bases de datos',
    loadComponent: () => import('./databases-list.page').then((m) => m.DatabasesListPage),
  },
  {
    path: 'new',
    title: 'Nueva conexión',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./database-form.page').then((m) => m.DatabaseFormPage),
  },
  {
    path: ':id',
    title: 'Base de datos',
    loadComponent: () => import('./database-detail.page').then((m) => m.DatabaseDetailPage),
  },
  {
    path: ':id/edit',
    title: 'Editar conexión',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./database-form.page').then((m) => m.DatabaseFormPage),
  },
];
