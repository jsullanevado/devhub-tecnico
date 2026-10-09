import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const SCRIPTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Scripts y plantillas',
    loadComponent: () => import('./scripts-list.page').then((m) => m.ScriptsListPage),
  },
  {
    path: 'new',
    title: 'Nuevo script',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./script-form.page').then((m) => m.ScriptFormPage),
  },
  {
    path: ':id',
    title: 'Script',
    loadComponent: () => import('./script-detail.page').then((m) => m.ScriptDetailPage),
  },
  {
    path: ':id/edit',
    title: 'Editar script',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./script-form.page').then((m) => m.ScriptFormPage),
  },
];
