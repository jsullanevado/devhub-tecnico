import { analyzeSoap, SOAP_SAMPLE } from './soap';
import { formatXml, minifyXml, parseXml } from './xml';

describe('XML', () => {
  it('formatea con sangría, conserva la declaración y los atributos', () => {
    const result = formatXml('<?xml version="1.0"?><a x="1"><b>texto</b><c/></a>');
    expect(result).toEqual({
      ok: true,
      output: '<?xml version="1.0"?>\n<a x="1">\n  <b>texto</b>\n  <c/>\n</a>',
    });
  });

  it('respeta prefijos de namespace, comentarios y CDATA', () => {
    const result = formatXml(
      '<ns:a xmlns:ns="urn:x"><!-- nota --><ns:b><![CDATA[<raw>]]></ns:b></ns:a>',
      '    ',
    );
    expect(result.ok && result.output).toBe(
      '<ns:a xmlns:ns="urn:x">\n    <!-- nota -->\n    <ns:b>\n        <![CDATA[<raw>]]>\n    </ns:b>\n</ns:a>',
    );
  });

  it('escapa caracteres especiales al reescribir', () => {
    const result = formatXml('<a t="&quot;x&quot; &amp; y">1 &lt; 2</a>');
    expect(result.ok && result.output).toBe('<a t="&quot;x&quot; &amp; y">1 &lt; 2</a>');
  });

  it('minifica eliminando espacios entre etiquetas', () => {
    expect(minifyXml('<a>\n  <b> 1 </b>\n</a>')).toEqual({ ok: true, output: '<a><b>1</b></a>' });
  });

  it('detecta XML mal formado y entrada vacía', () => {
    expect(parseXml('<a><b></a>').ok).toBe(false);
    expect(parseXml('   ').ok).toBe(false);
  });
});

describe('SOAP', () => {
  it('analiza el ejemplo SOAP 1.1', () => {
    const result = analyzeSoap(SOAP_SAMPLE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analysis.version).toBe('1.1');
      expect(result.analysis.hasHeader).toBe(true);
      expect(result.analysis.operation).toBe('cli:ConsultarCliente');
      expect(result.analysis.isFault).toBe(false);
      expect(result.analysis.formatted.split('\n').length).toBeGreaterThan(5);
    }
  });

  it('detecta un Fault SOAP 1.2 y su mensaje', () => {
    const fault = `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Body><env:Fault><env:Code><env:Value>env:Sender</env:Value></env:Code><env:Reason><env:Text xml:lang="es">Documento no válido</env:Text></env:Reason></env:Fault></env:Body></env:Envelope>`;
    const result = analyzeSoap(fault);
    expect(result.ok && result.analysis.version).toBe('1.2');
    expect(result.ok && result.analysis.isFault).toBe(true);
    expect(result.ok && result.analysis.faultMessage).toBe('Documento no válido');
  });

  it('rechaza XML que no es un sobre SOAP o sin Body', () => {
    expect(analyzeSoap('<a/>').ok).toBe(false);
    expect(
      analyzeSoap(
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Header/></s:Envelope>',
      ).ok,
    ).toBe(false);
  });
});
