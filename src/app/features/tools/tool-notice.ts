import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Alert } from '../../shared/ui/alert/alert';

/**
 * Aviso obligatorio de las herramientas: los generadores producen datos
 * ficticios y nada de lo introducido se envía ni se guarda.
 */
@Component({
  selector: 'app-tool-notice',
  imports: [Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (kind() === 'generator') {
      <app-alert type="warning">
        <strong>Datos ficticios solo para pruebas.</strong> No los uses para suplantar identidades,
        cometer fraude ni en sistemas productivos. Un valor aleatorio podría coincidir con uno real.
        Nada de lo generado se envía ni se guarda.
      </app-alert>
    } @else {
      <app-alert type="info">
        El procesamiento se realiza en tu navegador: el contenido no se envía al servidor ni se
        guarda. Aun así, evita pegar datos reales sensibles.
      </app-alert>
    }
  `,
})
export class ToolNotice {
  readonly kind = input<'generator' | 'processor'>('generator');
}
