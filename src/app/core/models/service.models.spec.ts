import {
  ServiceOperation,
  bodyLanguage,
  buildCurl,
  operationUrl,
  validateSoapUiFile,
} from './service.models';

const service = {
  base_url: 'http://172.19.172.21/',
  protocol: 'rest' as const,
  auth_type: 'basic' as const,
  auth_username: 'usr',
  auth_secret: "pa'ss",
};

const operation: ServiceOperation = {
  name: 'ejecutaAccionMovil',
  method: 'POST',
  path: '/v1.0/svcProblem/ejecutaAccionMovil',
  headers: [
    { name: 'idTransaccion', value: '1228493943' },
    { name: '  ', value: 'ignorado' },
  ],
  query_params: [{ name: 'q', value: 'a b&c' }],
  request_body: '{"MessageRequest": {}}',
};

describe('operationUrl', () => {
  it('une la URL base y el recurso sin barras duplicadas y codifica los query params', () => {
    expect(operationUrl(service.base_url, operation)).toBe(
      'http://172.19.172.21/v1.0/svcProblem/ejecutaAccionMovil?q=a%20b%26c',
    );
  });

  it('usa la URL base si no hay recurso y respeta un recurso absoluto', () => {
    expect(operationUrl('https://api.test', { name: 'x', method: 'GET' })).toBe('https://api.test');
    expect(
      operationUrl('https://api.test', { name: 'x', method: 'GET', path: 'https://otro/x' }),
    ).toBe('https://otro/x');
  });
});

describe('buildCurl', () => {
  it('incluye método, URL, Content-Type por defecto, headers y body escapado', () => {
    const curl = buildCurl(service, operation, { includeCredentials: false });
    expect(curl).toContain(
      `curl -X POST 'http://172.19.172.21/v1.0/svcProblem/ejecutaAccionMovil?q=a%20b%26c'`,
    );
    expect(curl).toContain(`-H 'Content-Type: application/json'`);
    expect(curl).toContain(`-H 'idTransaccion: 1228493943'`);
    expect(curl).not.toContain('ignorado');
    expect(curl).toContain(`--data-raw '{"MessageRequest": {}}'`);
    expect(curl).not.toContain('-u ');
  });

  it('añade credenciales solo si se piden, escapando comillas simples', () => {
    const curl = buildCurl(service, operation, { includeCredentials: true });
    expect(curl).toContain(`-u 'usr:pa'\\''ss'`);
  });

  it('no duplica Authorization si la operación ya lo trae como header', () => {
    const withHeader = { ...operation, headers: [{ name: 'Authorization', value: 'Basic abc' }] };
    expect(buildCurl(service, withHeader, { includeCredentials: true })).not.toContain('-u ');
  });

  it('en SOAP añade SOAPAction y text/xml; en GET no envía body', () => {
    const soap = buildCurl(
      { ...service, protocol: 'soap', auth_type: 'none' },
      { name: 'consulta', method: 'POST', soap_action: 'urn:consultar', request_body: '<a/>' },
      { includeCredentials: true },
    );
    expect(soap).toContain(`-H 'Content-Type: text/xml; charset=utf-8'`);
    expect(soap).toContain(`-H 'SOAPAction: "urn:consultar"'`);
    const get = buildCurl(service, { ...operation, method: 'GET' }, { includeCredentials: false });
    expect(get).not.toContain('--data-raw');
  });
});

describe('bodyLanguage', () => {
  it('deduce el resaltado del media type o del protocolo', () => {
    expect(bodyLanguage('application/json', 'soap')).toBe('json');
    expect(bodyLanguage('text/xml; charset=utf-8', 'rest')).toBe('xml');
    expect(bodyLanguage(null, 'soap')).toBe('xml');
    expect(bodyLanguage('', 'rest')).toBe('json');
    expect(bodyLanguage('text/plain', 'rest')).toBe('plaintext');
  });
});

describe('validateSoapUiFile', () => {
  const file = (name: string, size: number) =>
    new File([new Uint8Array(size)], name, { type: 'application/xml' });

  it('exige .xml, no vacío y como máximo 50 MB', () => {
    expect(validateSoapUiFile(file('Proyecto-soapui-project.xml', 10)).valid).toBe(true);
    expect(validateSoapUiFile(file('proyecto.zip', 10)).valid).toBe(false);
    expect(validateSoapUiFile(file('vacio.xml', 0)).valid).toBe(false);
  });
});
