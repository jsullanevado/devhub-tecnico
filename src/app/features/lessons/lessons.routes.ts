import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const LESSONS_ROUTES: Routes = [
  {
    path: '',
    title: 'Lecciones aprendidas',
    loadComponent: () => import('./lessons-list.page').then((m) => m.LessonsListPage),
  },
  {
    path: 'new',
    title: 'Registrar lección',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./lesson-form.page').then((m) => m.LessonFormPage),
  },
  {
    path: ':id',
    title: 'Lección aprendida',
    loadComponent: () => import('./lesson-detail.page').then((m) => m.LessonDetailPage),
  },
  {
    path: ':id/edit',
    title: 'Editar lección',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./lesson-form.page').then((m) => m.LessonFormPage),
  },
];
