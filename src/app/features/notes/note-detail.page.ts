import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FavoriteButton } from '../../shared/favorites/favorite-button';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { NotesService } from '../../core/data/notes.service';
import { Note } from '../../core/models';
import { Markdown } from '../../shared/markdown/markdown';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { RelatedList } from '../../shared/resources/related-list';
import { ResourceDeletion } from '../../shared/resources/resource-deletion';
import { ResourceMeta } from '../../shared/resources/resource-meta';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { noteCategoryLabel } from './notes.codec';

@Component({
  selector: 'app-note-detail-page',
  imports: [
    FavoriteButton,
    RouterLink,
    LoadState,
    PageHeader,
    ResourceMeta,
    Markdown,
    RelatedList,
    CopyButton,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl">
      <app-load-state [state]="loader.state()" backLink="/notes">
        @if (loader.value(); as note) {
          <app-page-header [title]="note.title" backLink="/notes" backLabel="Notas técnicas">
            <app-favorite-button type="note" [resourceId]="note.id" [resourceTitle]="note.title" />
            <app-copy-button [text]="wikiLink()" label="Copiar enlace wiki" />
            @if (permissions.canEdit(note)) {
              <a [routerLink]="['/notes', note.id, 'edit']" class="btn btn-secondary">
                <app-icon name="pencil" iconClass="size-4" /> Editar
              </a>
            }
            @if (permissions.canDelete(note)) {
              <button
                type="button"
                class="btn btn-danger"
                [disabled]="deleting()"
                (click)="remove(note)"
              >
                <app-icon name="trash" iconClass="size-4" /> Eliminar
              </button>
            }
          </app-page-header>

          <app-resource-meta class="mt-4" [resource]="note" tagLink="/notes">
            <span class="badge">{{ categoryLabel(note.category) }}</span>
          </app-resource-meta>

          <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_16rem]">
            <article class="card min-w-0 p-6 sm:p-8">
              @if (note.description) {
                <p class="mb-6 text-lg text-slate-600 dark:text-slate-400">
                  {{ note.description }}
                </p>
              }
              <app-markdown [content]="note.content" />
            </article>
            <div class="space-y-4">
              <app-related-list
                [items]="related.value() ?? []"
                basePath="/notes"
                heading="Notas relacionadas"
              />
              <p class="text-xs text-slate-500 dark:text-slate-400">
                Para enlazar esta nota desde otra, usa «Copiar enlace wiki» y pégalo en su
                contenido.
              </p>
            </div>
          </div>
        }
      </app-load-state>
    </div>
  `,
})
export class NoteDetailPage {
  readonly id = input.required<string>();

  private readonly notes = inject(NotesService);
  private readonly deletion = inject(ResourceDeletion);
  protected readonly permissions = inject(ResourcePermissions);

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.notes.getById(id),
  );
  protected readonly related = createAsyncLoader(
    () => this.loader.value(),
    (note) => this.notes.listRelated(note.id, note.tags),
  );
  /** Enlace Markdown interno: [Título](/notes/<id>), navegable dentro de la app. */
  protected readonly wikiLink = computed(() => {
    const note = this.loader.value();
    return note ? `[${note.title.replace(/[[\]]/g, '')}](/notes/${note.id})` : '';
  });
  protected readonly deleting = signal(false);
  protected readonly categoryLabel = noteCategoryLabel;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const note = this.loader.value();
      if (note) {
        title.setTitle(`${note.title} · ${environment.appName}`);
      }
    });
  }

  protected async remove(note: Note): Promise<void> {
    this.deleting.set(true);
    await this.deletion.run({
      dialogTitle: 'Eliminar nota',
      resourceTitle: note.title,
      successMessage: 'Nota eliminada.',
      remove: () => this.notes.delete(note.id),
      redirectTo: '/notes',
    });
    this.deleting.set(false);
  }
}
