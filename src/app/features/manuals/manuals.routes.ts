import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const MANUALS_ROUTES: Routes = [
  {
    path: '',
    title: 'Manuales y arquitecturas',
    loadComponent: () => import('./manuals-list.page').then((m) => m.ManualsListPage),
  },
  {
    path: 'new',
    title: 'Subir documento',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./manual-form.page').then((m) => m.ManualFormPage),
  },
  {
    path: ':id',
    title: 'Documento',
    loadComponent: () => import('./manual-detail.page').then((m) => m.ManualDetailPage),
  },
  {
    path: ':id/edit',
    title: 'Editar documento',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./manual-form.page').then((m) => m.ManualFormPage),
  },
];
