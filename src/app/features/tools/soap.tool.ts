import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { inputValue } from '../../shared/utils/dom-events';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { Alert } from '../../shared/ui/alert/alert';
import { CopyButton } from '../../shared/ui/copy-button/copy-button';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { analyzeSoap, SOAP_SAMPLE, SoapAnalysis } from './lib/soap';
import { XML_MAX_LENGTH } from './lib/xml';
import { ToolNotice } from './tool-notice';

@Component({
  selector: 'app-soap-tool',
  imports: [PageHeader, ToolNotice, CodeEditor, CopyButton, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl space-y-6">
      <app-page-header
        title="Formateador de mensajes SOAP"
        description="Formatea peticiones y respuestas SOAP 1.1/1.2 y revisa su estructura."
        backLink="/tools"
        backLabel="Herramientas"
      />
      <app-tool-notice kind="processor" />

      <section class="card space-y-4 p-5">
        <div>
          <label for="soap-input" class="label">Mensaje SOAP</label>
          <textarea
            id="soap-input"
            rows="12"
            class="input mt-1 font-mono text-xs"
            spellcheck="false"
            [maxLength]="maxLength"
            [value]="source()"
            (input)="source.set(inputValue($event))"
          ></textarea>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-primary" (click)="analyze()">
            Formatear y analizar
          </button>
          <button type="button" class="btn btn-secondary" (click)="loadSample()">
            Cargar ejemplo ficticio
          </button>
          <button type="button" class="btn btn-secondary" (click)="clear()">Limpiar</button>
        </div>
        @if (error(); as message) {
          <app-alert type="error">{{ message }}</app-alert>
        }
      </section>

      @if (analysis(); as result) {
        <section class="space-y-4" aria-labelledby="soap-result-heading">
          <h2 id="soap-result-heading" class="font-semibold">Resultado</h2>
          @if (result.isFault) {
            <app-alert type="warning">
              La respuesta contiene un SOAP Fault{{
                result.faultMessage ? ': ' + result.faultMessage : '.'
              }}
            </app-alert>
          }
          <dl class="card grid gap-4 p-5 text-sm sm:grid-cols-3">
            <div>
              <dt class="text-slate-500 dark:text-slate-400">Versión</dt>
              <dd class="mt-1 font-medium">SOAP {{ result.version }}</dd>
            </div>
            <div>
              <dt class="text-slate-500 dark:text-slate-400">Operación / contenido de Body</dt>
              <dd class="mt-1 font-mono">{{ result.operation ?? '(vacío)' }}</dd>
            </div>
            <div>
              <dt class="text-slate-500 dark:text-slate-400">Header</dt>
              <dd class="mt-1 font-medium">{{ result.hasHeader ? 'Presente' : 'No incluido' }}</dd>
            </div>
          </dl>
          <div class="flex justify-end">
            <app-copy-button [text]="result.formatted" label="Copiar formateado" />
          </div>
          <app-code-editor
            [value]="result.formatted"
            language="xml"
            [readonly]="true"
            ariaLabel="Mensaje SOAP formateado"
          />
        </section>
      }
    </div>
  `,
})
export class SoapTool {
  protected readonly inputValue = inputValue;
  protected readonly maxLength = XML_MAX_LENGTH;
  protected readonly source = signal('');
  protected readonly analysis = signal<SoapAnalysis | null>(null);
  protected readonly error = signal<string | null>(null);

  protected analyze(): void {
    const result = analyzeSoap(this.source());
    if (result.ok) {
      this.analysis.set(result.analysis);
      this.error.set(null);
    } else {
      this.analysis.set(null);
      this.error.set(result.error);
    }
  }

  protected loadSample(): void {
    this.source.set(SOAP_SAMPLE);
    this.analyze();
  }

  protected clear(): void {
    this.source.set('');
    this.analysis.set(null);
    this.error.set(null);
  }
}
