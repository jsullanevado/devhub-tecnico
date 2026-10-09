import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FavoriteButton } from '../../shared/favorites/favorite-button';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ScriptsService } from '../../core/data/scripts.service';
import { Script, scriptFileName, scriptLanguageLabel } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourceDeletion } from '../../shared/resources/resource-deletion';
import { ResourceMeta } from '../../shared/resources/resource-meta';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { downloadTextFile } from '../../shared/utils/file-utils';
import { scriptCategoryLabel } from './scripts.codec';

@Component({
  selector: 'app-script-detail-page',
  imports: [
    FavoriteButton,
    RouterLink,
    LoadState,
    PageHeader,
    ResourceMeta,
    CodeEditor,
    CopyButton,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl">
      <app-load-state [state]="loader.state()" backLink="/scripts">
        @if (loader.value(); as script) {
          <app-page-header [title]="script.title" backLink="/scripts" backLabel="Scripts">
            <app-favorite-button
              type="script"
              [resourceId]="script.id"
              [resourceTitle]="script.title"
            />
            <app-copy-button [text]="script.content" label="Copiar código" />
            <button type="button" class="btn btn-secondary" (click)="download(script)">
              <app-icon name="download" iconClass="size-4" /> Descargar
            </button>
            @if (permissions.canEdit(script)) {
              <a [routerLink]="['/scripts', script.id, 'edit']" class="btn btn-secondary">
                <app-icon name="pencil" iconClass="size-4" /> Editar
              </a>
            }
            @if (permissions.canDelete(script)) {
              <button
                type="button"
                class="btn btn-danger"
                [disabled]="deleting()"
                (click)="remove(script)"
              >
                <app-icon name="trash" iconClass="size-4" /> Eliminar
              </button>
            }
          </app-page-header>

          <app-resource-meta class="mt-4" [resource]="script" tagLink="/scripts">
            <span class="badge">{{ categoryLabel(script.category) }}</span>
            <span class="badge font-mono">{{ languageLabel(script.language) }}</span>
            @if (script.is_template) {
              <span
                class="badge bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
              >
                Plantilla
              </span>
            }
          </app-resource-meta>

          @if (script.description) {
            <p class="mt-4 whitespace-pre-line text-slate-700 dark:text-slate-300">
              {{ script.description }}
            </p>
          }

          <app-code-editor
            class="mt-6"
            [value]="script.content"
            [language]="script.language"
            [readonly]="true"
            [ariaLabel]="'Código de ' + script.title"
          />
        }
      </app-load-state>
    </div>
  `,
})
export class ScriptDetailPage {
  readonly id = input.required<string>();

  private readonly scripts = inject(ScriptsService);
  private readonly deletion = inject(ResourceDeletion);
  private readonly notifications = inject(NotificationService);
  protected readonly permissions = inject(ResourcePermissions);

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.scripts.getById(id),
  );
  protected readonly deleting = signal(false);
  protected readonly categoryLabel = scriptCategoryLabel;
  protected readonly languageLabel = scriptLanguageLabel;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const script = this.loader.value();
      if (script) {
        title.setTitle(`${script.title} · ${environment.appName}`);
      }
    });
  }

  protected download(script: Script): void {
    const fileName = scriptFileName(script);
    downloadTextFile(fileName, script.content);
    this.notifications.success(`Descargado como ${fileName}.`);
  }

  protected async remove(script: Script): Promise<void> {
    this.deleting.set(true);
    await this.deletion.run({
      dialogTitle: 'Eliminar script',
      resourceTitle: script.title,
      successMessage: 'Script eliminado.',
      remove: () => this.scripts.delete(script.id),
      redirectTo: '/scripts',
    });
    this.deleting.set(false);
  }
}
