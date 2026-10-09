import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ManualsService } from '../../core/data/manuals.service';
import { toAppError } from '../../core/errors/error-mapper';
import { Manual, manualPreviewKind } from '../../core/models';
import { Markdown } from '../../shared/markdown/markdown';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { Spinner } from '../../shared/ui/spinner/spinner';

/** Límite de texto a mostrar en la vista previa (el resto se descarga). */
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

/**
 * Vista previa bajo demanda (no suma descargas). El archivo se obtiene con la
 * sesión del usuario y se muestra desde un blob local cuyo tipo está forzado
 * al MIME validado: PDF en el visor del navegador, imágenes, texto y Markdown.
 */
@Component({
  selector: 'app-manual-preview',
  imports: [Markdown, Alert, Spinner, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (!kind()) {
      <p class="text-sm text-slate-600 dark:text-slate-400">
        Este formato no admite vista previa en el navegador. Descárgalo para abrirlo.
      </p>
    } @else {
      @switch (status()) {
        @case ('idle') {
          <button type="button" class="btn btn-secondary" (click)="load()">
            <app-icon name="eye" iconClass="size-4" /> Mostrar vista previa
          </button>
        }
        @case ('loading') {
          <div class="flex items-center gap-3 py-8 text-sm text-slate-600 dark:text-slate-400">
            <app-spinner size="sm" label="" /> Cargando vista previa…
          </div>
        }
        @case ('error') {
          <app-alert type="error">
            {{ error() }}
            <button type="button" class="link ms-2" (click)="load()">Reintentar</button>
          </app-alert>
        }
        @case ('ready') {
          @switch (kind()) {
            @case ('pdf') {
              <iframe
                class="h-[75vh] w-full rounded-md border border-slate-200 dark:border-slate-700"
                [src]="resourceUrl()"
                [title]="'Vista previa de ' + manual().file_name"
                referrerpolicy="no-referrer"
              ></iframe>
            }
            @case ('image') {
              <img
                class="mx-auto max-h-[75vh] rounded-md border border-slate-200 dark:border-slate-700"
                [src]="objectUrl()"
                [alt]="'Vista previa de ' + manual().title"
              />
            }
            @case ('markdown') {
              <div class="card p-6"><app-markdown [content]="text()" /></div>
            }
            @case ('text') {
              <pre
                class="card max-h-[75vh] overflow-auto p-4 font-mono text-sm whitespace-pre-wrap"
                >{{ text() }}</pre>
            }
          }
        }
      }
    }
  `,
})
export class ManualPreview {
  readonly manual = input.required<Manual>();

  private readonly manuals = inject(ManualsService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly kind = computed(() => manualPreviewKind(this.manual().mime_type));
  protected readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly error = signal('');
  protected readonly objectUrl = signal<string | null>(null);
  protected readonly resourceUrl = signal<SafeResourceUrl | null>(null);
  protected readonly text = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
  }

  protected async load(): Promise<void> {
    const manual = this.manual();
    const kind = this.kind();
    if (!kind) {
      return;
    }
    if ((kind === 'text' || kind === 'markdown') && manual.file_size > TEXT_PREVIEW_MAX_BYTES) {
      this.error.set('El archivo es demasiado grande para previsualizarlo. Descárgalo.');
      this.status.set('error');
      return;
    }

    this.status.set('loading');
    try {
      const blob = await this.manuals.getPreviewBlob(manual);
      this.revoke();
      if (kind === 'text' || kind === 'markdown') {
        this.text.set(await blob.text());
      } else {
        const url = URL.createObjectURL(blob);
        this.objectUrl.set(url);
        // Solo URLs blob: creadas aquí, con tipo forzado a PDF.
        this.resourceUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      }
      this.status.set('ready');
    } catch (error) {
      this.error.set(toAppError(error).message);
      this.status.set('error');
    }
  }

  private revoke(): void {
    const url = this.objectUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrl.set(null);
      this.resourceUrl.set(null);
    }
  }
}
