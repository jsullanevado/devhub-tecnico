import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const NOTES_ROUTES: Routes = [
  {
    path: '',
    title: 'Notas técnicas',
    loadComponent: () => import('./notes-list.page').then((m) => m.NotesListPage),
  },
  {
    path: 'new',
    title: 'Nueva nota',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./note-form.page').then((m) => m.NoteFormPage),
  },
  {
    path: ':id',
    title: 'Nota',
    loadComponent: () => import('./note-detail.page').then((m) => m.NoteDetailPage),
  },
  {
    path: ':id/edit',
    title: 'Editar nota',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./note-form.page').then((m) => m.NoteFormPage),
  },
];
