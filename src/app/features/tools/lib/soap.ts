import { formatXml, parseXml, XmlIndent } from './xml';

export const SOAP_NAMESPACES = {
  '1.1': 'http://schemas.xmlsoap.org/soap/envelope/',
  '1.2': 'http://www.w3.org/2003/05/soap-envelope',
} as const;

export type SoapVersion = keyof typeof SOAP_NAMESPACES;

export interface SoapAnalysis {
  version: SoapVersion;
  hasHeader: boolean;
  /** Primer elemento dentro de Body (operación o respuesta). */
  operation: string | null;
  isFault: boolean;
  faultMessage: string | null;
  formatted: string;
}

export type SoapResult = { ok: true; analysis: SoapAnalysis } | { ok: false; error: string };

/** Valida la estructura básica de un mensaje SOAP 1.1/1.2 y lo formatea. */
export function analyzeSoap(source: string, indent: XmlIndent = '  '): SoapResult {
  const parsed = parseXml(source);
  if (!parsed.ok) {
    return parsed;
  }
  const envelope = parsed.document.documentElement;
  const version = (Object.keys(SOAP_NAMESPACES) as SoapVersion[]).find(
    (key) => SOAP_NAMESPACES[key] === envelope.namespaceURI,
  );
  if (envelope.localName !== 'Envelope' || !version) {
    return {
      ok: false,
      error: 'El elemento raíz debe ser Envelope con el namespace de SOAP 1.1 o 1.2.',
    };
  }

  const children = Array.from(envelope.children).filter(
    (child) => child.namespaceURI === envelope.namespaceURI,
  );
  const header = children.find((child) => child.localName === 'Header');
  const body = children.find((child) => child.localName === 'Body');
  if (!body) {
    return { ok: false, error: 'Falta el elemento obligatorio Body dentro de Envelope.' };
  }
  if (header && children.indexOf(header) > children.indexOf(body)) {
    return { ok: false, error: 'Header debe aparecer antes de Body.' };
  }

  const payload = body.firstElementChild;
  const isFault = payload?.localName === 'Fault' && payload.namespaceURI === envelope.namespaceURI;
  const formatted = formatXml(source, indent);

  return {
    ok: true,
    analysis: {
      version,
      hasHeader: !!header,
      operation: payload?.tagName ?? null,
      isFault,
      faultMessage: isFault ? faultText(payload, version) : null,
      formatted: formatted.ok ? formatted.output : source,
    },
  };
}

function faultText(fault: Element, version: SoapVersion): string | null {
  const name = version === '1.1' ? 'faultstring' : 'Text';
  const node = Array.from(fault.getElementsByTagName('*')).find(
    (element) => element.localName === name,
  );
  return node?.textContent?.trim() || null;
}

/** Ejemplo con datos ficticios para probar la herramienta. */
export const SOAP_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cli="http://ejemplo.devhub.test/clientes"><soapenv:Header><cli:Credenciales><cli:usuario>usuario.prueba</cli:usuario></cli:Credenciales></soapenv:Header><soapenv:Body><cli:ConsultarCliente><cli:tipoDocumento>RUC</cli:tipoDocumento><cli:numeroDocumento>20000000001</cli:numeroDocumento></cli:ConsultarCliente></soapenv:Body></soapenv:Envelope>`;
