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
import { ManualsService } from '../../core/data/manuals.service';
import { toAppError } from '../../core/errors/error-mapper';
import { Manual, manualFileLabel } from '../../core/models';
import { NotificationService } from '../../core/notifications/notification.service';
import { createAsyncLoader } from '../../shared/resources/async-loader';
import { LoadState } from '../../shared/resources/load-state';
import { ResourceDeletion } from '../../shared/resources/resource-deletion';
import { ResourceMeta } from '../../shared/resources/resource-meta';
import { ResourcePermissions } from '../../shared/resources/resource-permissions';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { openDownloadUrl } from '../../shared/utils/file-utils';
import { formatBytes } from '../../shared/utils/format';
import { ManualPreview } from './manual-preview';
import { manualCategoryLabel } from './manuals.codec';

@Component({
  selector: 'app-manual-detail-page',
  imports: [
    FavoriteButton,
    RouterLink,
    LoadState,
    PageHeader,
    ResourceMeta,
    ManualPreview,
    Icon,
    Spinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl">
      <app-load-state [state]="loader.state()" backLink="/manuals">
        @if (loader.value(); as manual) {
          <app-page-header [title]="manual.title" backLink="/manuals" backLabel="Manuales">
            <app-favorite-button
              type="manual"
              [resourceId]="manual.id"
              [resourceTitle]="manual.title"
            />
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="downloading()"
              (click)="download(manual)"
            >
              @if (downloading()) {
                <app-spinner size="sm" label="Preparando descarga…" />
              } @else {
                <app-icon name="download" iconClass="size-4" />
              }
              Descargar
            </button>
            @if (permissions.canEdit(manual)) {
              <a [routerLink]="['/manuals', manual.id, 'edit']" class="btn btn-secondary">
                <app-icon name="pencil" iconClass="size-4" /> Editar
              </a>
            }
            @if (permissions.canDelete(manual)) {
              <button
                type="button"
                class="btn btn-danger"
                [disabled]="deleting()"
                (click)="remove(manual)"
              >
                <app-icon name="trash" iconClass="size-4" /> Eliminar
              </button>
            }
          </app-page-header>

          <app-resource-meta class="mt-4" [resource]="manual" tagLink="/manuals">
            <span class="badge">{{ categoryLabel(manual.category) }}</span>
            @if (manual.version) {
              <span class="badge">v{{ manual.version }}</span>
            }
          </app-resource-meta>

          @if (manual.description) {
            <p class="mt-4 whitespace-pre-line text-slate-700 dark:text-slate-300">
              {{ manual.description }}
            </p>
          }

          <dl class="card mt-6 grid gap-4 p-5 text-sm sm:grid-cols-4">
            <div class="sm:col-span-2">
              <dt class="text-slate-500 dark:text-slate-400">Archivo</dt>
              <dd class="mt-1 font-medium break-all">{{ manual.file_name }}</dd>
            </div>
            <div>
              <dt class="text-slate-500 dark:text-slate-400">Tipo y tamaño</dt>
              <dd class="mt-1 font-medium">
                {{ fileLabel(manual.mime_type) }} · {{ size(manual.file_size) }}
              </dd>
            </div>
            <div>
              <dt class="text-slate-500 dark:text-slate-400">Descargas</dt>
              <dd class="mt-1 font-medium">{{ downloadCount() }}</dd>
            </div>
          </dl>

          <section class="mt-6" aria-labelledby="manual-preview-heading">
            <h2 id="manual-preview-heading" class="mb-3 text-lg font-semibold">Vista previa</h2>
            <app-manual-preview [manual]="manual" />
          </section>
        }
      </app-load-state>
    </div>
  `,
})
export class ManualDetailPage {
  readonly id = input.required<string>();

  private readonly manuals = inject(ManualsService);
  private readonly deletion = inject(ResourceDeletion);
  private readonly notifications = inject(NotificationService);
  protected readonly permissions = inject(ResourcePermissions);

  protected readonly loader = createAsyncLoader(
    () => this.id(),
    (id) => this.manuals.getById(id),
  );
  private readonly updatedCount = signal<number | null>(null);
  protected readonly downloadCount = computed(
    () => this.updatedCount() ?? this.loader.value()?.download_count ?? 0,
  );
  protected readonly downloading = signal(false);
  protected readonly deleting = signal(false);
  protected readonly categoryLabel = manualCategoryLabel;
  protected readonly fileLabel = manualFileLabel;
  protected readonly size = formatBytes;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const manual = this.loader.value();
      if (manual) {
        title.setTitle(`${manual.title} · ${environment.appName}`);
      }
    });
  }

  protected async download(manual: Manual): Promise<void> {
    if (this.downloading()) {
      return;
    }
    this.downloading.set(true);
    try {
      const { url, downloadCount } = await this.manuals.prepareDownload(manual);
      openDownloadUrl(url);
      if (downloadCount !== null) {
        this.updatedCount.set(downloadCount);
      }
    } catch (error) {
      this.notifications.error(toAppError(error).message);
    } finally {
      this.downloading.set(false);
    }
  }

  protected async remove(manual: Manual): Promise<void> {
    this.deleting.set(true);
    await this.deletion.run({
      dialogTitle: 'Eliminar documento',
      resourceTitle: manual.title,
      successMessage: 'Documento eliminado.',
      remove: () => this.manuals.delete(manual.id),
      redirectTo: '/manuals',
    });
    this.deleting.set(false);
  }
}
