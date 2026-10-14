import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { analyzePage, listPages, setVfs } from './engine/flow-analyzer';
import { buildEventFlows } from './engine/flow-builder';
import { Vfs } from './engine/vfs';
import { decodeSource } from './flows.service';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

function repo(): Vfs {
  const vfs = new Vfs();
  vfs.add(
    'Web/Pagina.aspx',
    '<%@ Page Language="VB" CodeFile="Pagina.aspx.vb" %>\n<asp:Button ID="btnGrabar" Text="Grabar" OnClick="btnGrabar_Click" runat="server" />',
  );
  vfs.add(
    'Web/Pagina.aspx.vb',
    [
      'Public Class Pagina',
      '  Protected Sub btnGrabar_Click(sender As Object, e As EventArgs)',
      '    Dim cmd As New OracleCommand()',
      '    cmd.CommandText = "PKG_CLIENTE.SP_GUARDAR"',
      '    cmd.ExecuteNonQuery()',
      '  End Sub',
      'End Class',
    ].join('\n'),
  );
  return vfs;
}

describe('motor de flujos (portado de B)', () => {
  it('lista páginas y detecta el evento del botón', () => {
    setVfs(repo());
    expect(listPages('')).toEqual(['Web/Pagina.aspx']);
    const analysis = analyzePage('', 'Web/Pagina.aspx');
    expect(analysis.kind).toBe('webforms');
    expect(analysis.events).toHaveLength(1);
    expect(analysis.events[0].trigger).toContain('Grabar');
  });

  it('el paso de BD llega al carril bd y el BPMN es XML válido con un solo laneSet', () => {
    setVfs(repo());
    const event = analyzePage('', 'Web/Pagina.aspx').events[0];
    const steps = event.groups.flatMap((group) => group.steps);
    expect(steps.some((step) => step.lane === 'bd' && /SP_GUARDAR/.test(step.name))).toBe(true);

    const [main] = buildEventFlows({ title: 'Pagina & prueba', event, graph: null });
    const { window } = new JSDOM('');
    const document = new window.DOMParser().parseFromString(main.xml, 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.getElementsByTagNameNS(BPMN_NS, 'laneSet')).toHaveLength(1);
    expect(document.getElementsByTagNameNS(BPMN_NS, 'lane')).toHaveLength(4);
    expect(main.layout.lanes).toHaveLength(4);
  });
});

describe('decodeSource', () => {
  it('quita el BOM y recurre a Windows-1252 cuando no es UTF-8', () => {
    expect(decodeSource(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
    expect(decodeSource(new Uint8Array([0x4d, 0xe1, 0x73]))).toBe('Más');
  });
});
