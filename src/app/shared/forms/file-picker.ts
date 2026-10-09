import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { Icon } from '../ui/icon/icon';
import { formatBytes } from '../utils/format';

/**
 * Selector de un archivo con zona de arrastrar y soltar. Accesible por teclado
 * (el input nativo sigue siendo focusable). La validación la hace quien lo usa.
 */
@Component({
  selector: 'app-file-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label
      [for]="inputId()"
      class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-8 text-center text-sm transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30 hover:border-indigo-400 dark:border-slate-700"
      [class.border-indigo-500]="dragging()"
      [class.bg-indigo-50]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <app-icon name="upload" iconClass="size-8 text-slate-400" />
      <span><span class="link">Selecciona un archivo</span> o arrástralo aquí</span>
      <span class="text-xs text-slate-500 dark:text-slate-400">{{ hint() }}</span>
      <input
        type="file"
        class="sr-only"
        [id]="inputId()"
        [accept]="accept()"
        [disabled]="disabled()"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-describedby]="error() ? inputId() + '-error' : null"
        (change)="onChange($event)"
      />
    </label>

    @if (file(); as selected) {
      <div
        class="mt-2 flex items-center justify-between gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"
      >
        <span class="min-w-0 truncate">
          <strong class="font-medium">{{ selected.name }}</strong> · {{ size(selected.size) }}
        </span>
        <button type="button" class="link shrink-0 text-sm" (click)="clear()">Quitar</button>
      </div>
    }
    @if (error(); as message) {
      <p
        [id]="inputId() + '-error'"
        class="mt-1 text-sm text-red-600 dark:text-red-400"
        role="alert"
      >
        {{ message }}
      </p>
    }
  `,
})
export class FilePicker {
  readonly inputId = input.required<string>();
  readonly accept = input('');
  readonly hint = input('');
  readonly file = input<File | null>(null);
  readonly error = input<string | null>(null);
  readonly disabled = input(false);
  readonly fileChange = output<File | null>();

  protected readonly dragging = signal(false);
  protected readonly size = formatBytes;

  protected onChange(event: Event): void {
    const field = event.target as HTMLInputElement;
    this.fileChange.emit(field.files?.item(0) ?? null);
    // Permite volver a elegir el mismo archivo tras quitarlo.
    field.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(!this.disabled());
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (!this.disabled()) {
      this.fileChange.emit(event.dataTransfer?.files.item(0) ?? null);
    }
  }

  protected clear(): void {
    this.fileChange.emit(null);
  }
}
