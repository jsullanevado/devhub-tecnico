import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildBpmnXml } from './flows.service';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

describe('buildBpmnXml', () => {
  it('creates a parseable diagram with one lane set and four lanes', () => {
    const xml = buildBpmnXml(
      {
        id: 'E1',
        name: 'Guardar & consultar',
        trigger: 'Botón Guardar',
        steps: [
          { lane: 'servicio', name: 'Guardar', doc: 'Backend' },
          { lane: 'bd', name: 'PROCESO.GUARDAR', doc: 'Datos' },
        ],
      },
      'Mantenimiento.aspx',
    );
    const { window } = new JSDOM('');
    const document = new window.DOMParser().parseFromString(xml, 'application/xml');

    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.getElementsByTagNameNS(BPMN_NS, 'laneSet')).toHaveLength(1);
    expect(document.getElementsByTagNameNS(BPMN_NS, 'lane')).toHaveLength(4);
    expect(document.getElementsByTagNameNS(BPMN_NS, 'sequenceFlow')).toHaveLength(3);
    expect(document.getElementsByTagNameNS(BPMN_NS, 'process')[0].getAttribute('name')).toBe(
      'Guardar & consultar',
    );
  });
});