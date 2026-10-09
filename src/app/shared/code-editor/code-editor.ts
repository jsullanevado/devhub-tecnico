import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  forwardRef,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { oneDark } from '@codemirror/theme-one-dark';
import { Compartment, EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { ThemeService } from '../../core/theme/theme.service';
import { languageExtension } from './languages';

const BASE_THEME = EditorView.theme({
  '&': { fontSize: '13px' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  },
  '&.cm-focused': { outline: '2px solid rgb(99 102 241 / 0.6)' },
});

/**
 * Editor/visor de código (CodeMirror 6) con resaltado, números de línea y
 * búsqueda (Ctrl+F). Funciona como control de formulario o, con `readonly`,
 * como visor del valor recibido en `value`. Tab no queda atrapado (accesibilidad).
 */
@Component({
  selector: 'app-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeEditor), multi: true },
  ],
  host: { class: 'block' },
  template: `<div
    #host
    class="code-editor overflow-hidden rounded-md border border-slate-300 dark:border-slate-700"
    [class.code-editor--edit]="!readonly()"
  ></div>`,
})
export class CodeEditor implements ControlValueAccessor {
  readonly language = input('plaintext');
  readonly readonly = input(false);
  /** Contenido a mostrar cuando no se usa como control de formulario. */
  readonly value = input<string | null>(null);
  readonly ariaLabel = input('Editor de código');

  private readonly theme = inject(ThemeService);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly languageConf = new Compartment();
  private readonly themeConf = new Compartment();
  private readonly editableConf = new Compartment();

  private view: EditorView | null = null;
  private pendingDoc = '';
  private disabled = false;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    afterNextRender(() => this.createView());
    inject(DestroyRef).onDestroy(() => this.view?.destroy());

    effect(() => this.reconfigure(this.languageConf, languageExtension(this.language())));
    effect(() => this.reconfigure(this.themeConf, this.theme.resolved() === 'dark' ? oneDark : []));
    effect(() => {
      const readonly = this.readonly();
      untracked(() => this.reconfigure(this.editableConf, this.editableExtension(readonly)));
    });
    effect(() => {
      const value = this.value();
      if (value !== null) {
        untracked(() => this.setDoc(value));
      }
    });
  }

  writeValue(value: string | null): void {
    this.setDoc(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.reconfigure(this.editableConf, this.editableExtension(this.readonly()));
  }

  private createView(): void {
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.pendingDoc,
        extensions: [
          basicSetup,
          BASE_THEME,
          this.languageConf.of(languageExtension(this.language())),
          this.themeConf.of(this.theme.resolved() === 'dark' ? oneDark : []),
          this.editableConf.of(this.editableExtension(this.readonly())),
          EditorView.contentAttributes.of({ 'aria-label': this.ariaLabel() }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.onChange(update.state.doc.toString());
            }
            if (update.focusChanged && !update.view.hasFocus) {
              this.onTouched();
            }
          }),
        ],
      }),
    });
  }

  private editableExtension(readonly: boolean): Extension {
    const locked = readonly || this.disabled;
    return [EditorState.readOnly.of(locked), EditorView.editable.of(!locked)];
  }

  /** Cambia el documento sin notificar al formulario (el valor viene de fuera). */
  private setDoc(doc: string): void {
    this.pendingDoc = doc;
    const view = this.view;
    if (!view || view.state.doc.toString() === doc) {
      return;
    }
    const listener = this.onChange;
    this.onChange = () => undefined;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
    this.onChange = listener;
  }

  private reconfigure(compartment: Compartment, extension: Extension): void {
    this.view?.dispatch({ effects: compartment.reconfigure(extension) });
  }
}
