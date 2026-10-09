import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { inputValue } from '../../shared/utils/dom-events';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { Alert } from '../../shared/ui/alert/alert';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { formatXml, minifyXml, parseXml, XML_MAX_LENGTH, XmlIndent } from './lib/xml';
import { ToolNotice } from './tool-notice';

const INDENTS: readonly { value: XmlIndent; label: string }[] = [
  { value: '  ', label: '2 espacios' },
  { value: '    ', label: '4 espacios' },
  { value: '\t', label: 'Tabulador' },
];

@Component({
  selector: 'app-xml-tool',
  imports: [PageHeader, ToolNotice, CodeEditor, CopyButton, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl space-y-6">
      <app-page-header
        title="Formateador y validador XML"
        description="Comprueba que el XML esté bien formado y dale formato legible o compacto."
        backLink="/tools"
        backLabel="Herramientas"
      />
      <app-tool-notice kind="processor" />

      <section class="card space-y-4 p-5">
        <div>
          <label for="xml-input" class="label">XML de entrada</label>
          <textarea
            id="xml-input"
            rows="12"
            class="input mt-1 font-mono text-xs"
            spellcheck="false"
            [maxLength]="maxLength"
            [value]="source()"
            (input)="source.set(inputValue($event))"
          ></textarea>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <div>
            <label for="xml-indent" class="label">Sangría</label>
            <select id="xml-indent" class="input mt-1 w-auto" (change)="onIndent($event)">
              @for (option of indents; track option.label; let index = $index) {
                <option [value]="index">{{ option.label }}</option>
              }
            </select>
          </div>
          <button type="button" class="btn btn-primary" (click)="format()">Formatear</button>
          <button type="button" class="btn btn-secondary" (click)="minify()">Minificar</button>
          <button type="button" class="btn btn-secondary" (click)="validate()">Solo validar</button>
          <button type="button" class="btn btn-secondary" (click)="clear()">Limpiar</button>
        </div>
        @if (message(); as status) {
          <app-alert [type]="status.ok ? 'success' : 'error'">{{ status.text }}</app-alert>
        }
      </section>

      @if (output()) {
        <section class="space-y-3" aria-labelledby="xml-output-heading">
          <div class="flex items-center justify-between">
            <h2 id="xml-output-heading" class="font-semibold">Resultado</h2>
            <app-copy-button [text]="output()" label="Copiar resultado" />
          </div>
          <app-code-editor
            [value]="output()"
            language="xml"
            [readonly]="true"
            ariaLabel="XML formateado"
          />
        </section>
      }
    </div>
  `,
})
export class XmlTool {
  protected readonly inputValue = inputValue;
  protected readonly indents = INDENTS;
  protected readonly maxLength = XML_MAX_LENGTH;
  protected readonly source = signal('');
  protected readonly output = signal('');
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  private indent: XmlIndent = '  ';

  protected onIndent(event: Event): void {
    this.indent = INDENTS[Number((event.target as HTMLSelectElement).value)]?.value ?? '  ';
  }

  protected format(): void {
    this.apply(formatXml(this.source(), this.indent), 'XML bien formado. Formato aplicado.');
  }

  protected minify(): void {
    this.apply(minifyXml(this.source()), 'XML bien formado. Resultado minificado.');
  }

  protected validate(): void {
    const result = parseXml(this.source());
    this.message.set(
      result.ok
        ? { ok: true, text: 'El XML está bien formado.' }
        : { ok: false, text: result.error },
    );
  }

  protected clear(): void {
    this.source.set('');
    this.output.set('');
    this.message.set(null);
  }

  private apply(result: ReturnType<typeof formatXml>, successText: string): void {
    if (result.ok) {
      this.output.set(result.output);
      this.message.set({ ok: true, text: successText });
    } else {
      this.output.set('');
      this.message.set({ ok: false, text: result.error });
    }
  }
}
