import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const SERVICES_ROUTES: Routes = [
  {
    path: '',
    title: 'Servicios',
    loadComponent: () => import('./services-list.page').then((m) => m.ServicesListPage),
  },
  {
    path: 'new',
    title: 'Nuevo servicio',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./service-form.page').then((m) => m.ServiceFormPage),
  },
  {
    path: ':id',
    title: 'Servicio',
    loadComponent: () => import('./service-detail.page').then((m) => m.ServiceDetailPage),
  },
  {
    path: ':id/edit',
    title: 'Editar servicio',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./service-form.page').then((m) => m.ServiceFormPage),
  },
];
