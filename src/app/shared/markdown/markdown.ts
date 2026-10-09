import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { renderMarkdown } from './render-markdown';

/**
 * Muestra Markdown con estilos de lectura. Los enlaces internos (/notes/…,
 * /scripts/…) navegan con el router sin recargar la página (navegación tipo wiki).
 */
@Component({
  selector: 'app-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'prose prose-slate block max-w-none dark:prose-invert prose-pre:bg-slate-900 prose-code:before:content-none prose-code:after:content-none',
    '(click)': 'onClick($event)',
  },
  template: `<div [innerHTML]="html()"></div>`,
})
export class Markdown {
  private readonly router = inject(Router);
  readonly content = input('');
  protected readonly html = computed(() => renderMarkdown(this.content()));

  protected onClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href');
    const isInternal = !!href && href.startsWith('/') && !href.startsWith('//');
    const modified = event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey;
    if (isInternal && !modified) {
      event.preventDefault();
      void this.router.navigateByUrl(href);
    }
  }
}
