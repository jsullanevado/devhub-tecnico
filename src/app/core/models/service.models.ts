import { BaseResource, BaseResourceInput } from './common.models';

// Mantener sincronizado con los CHECK de public.services y con
// private.service_operations_valid (migración 20261011000000).

export const SERVICE_PROTOCOLS = [
  { value: 'rest', label: 'REST' },
  { value: 'soap', label: 'SOAP' },
] as const;
export type ServiceProtocol = (typeof SERVICE_PROTOCOLS)[number]['value'];

/** Tipo de componente (obligatorio): servicio REST/SOAP de backend o DataPower. */
export const SERVICE_KINDS = [
  { value: 'service', label: 'Servicio' },
  { value: 'datapower', label: 'DataPower' },
] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number]['value'];

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const SERVICE_AUTH_TYPES = [
  { value: 'none', label: 'Sin autenticación' },
  { value: 'basic', label: 'Basic (usuario y contraseña)' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'api_key', label: 'API key (header)' },
  { value: 'other', label: 'Otra (ver notas)' },
] as const;
export type ServiceAuthType = (typeof SERVICE_AUTH_TYPES)[number]['value'];

/** Media types sugeridos en el formulario (se admite cualquier otro). */
export const COMMON_MEDIA_TYPES = [
  'application/json',
  'text/xml; charset=utf-8',
  'application/soap+xml; charset=utf-8',
  'application/xml',
  'application/x-www-form-urlencoded',
  'text/plain',
] as const;

export const SERVICE_LIMITS = {
  systemMax: 60,
  urlMax: 500,
  wsdlMax: 1000,
  datapowerDomainMax: 100,
  datapowerObjectMax: 150,
  authUsernameMax: 200,
  authSecretMax: 4000,
  authNotesMax: 2000,
  notesMax: 20_000,
  operationsMax: 50,
  operationNameMax: 120,
  pathMax: 1000,
  soapActionMax: 500,
  mediaTypeMax: 100,
  bodyMax: 200_000,
  operationNotesMax: 5000,
  pairsMax: 50,
  pairNameMax: 200,
  pairValueMax: 4000,
  soapUiMaxBytes: 50 * 1024 * 1024,
} as const;

export const SERVICE_URL_PATTERN = /^https?:\/\/\S+$/;

export interface KeyValue {
  name: string;
  value: string;
}

export interface ServiceOperation {
  name: string;
  method: HttpMethod;
  /** Recurso relativo a base_url (p. ej. /v1/clientes/{id}); vacío = la URL base. */
  path?: string | null;
  soap_action?: string | null;
  media_type?: string | null;
  headers?: KeyValue[];
  query_params?: KeyValue[];
  request_body?: string | null;
  response_body?: string | null;
  response_status?: number | null;
  notes?: string | null;
  /**
   * Servicios a los que llama: un DataPower enruta a uno solo; un REST/SOAP puede llamar
   * a varios.
   */
  targets?: ServiceOperationTarget[];
  /** Objetos de base de datos que usa (package, SP, tabla…). */
  db_refs?: ServiceDbRef[];
}

/** Objeto de BD que usa una operación: conexión + objeto (ESQUEMA.NOMBRE) + SP del package. */
export interface ServiceDbRef {
  database_id: string;
  object: string;
  member?: string | null;
}

export interface ServiceOperationTarget {
  service_id: string;
  /** Operación concreta del servicio destino (opcional). */
  operation?: string | null;
}

/** Servicio en el selector de destino (RPC services_catalog). */
export interface ServiceCatalogItem {
  id: string;
  title: string;
  kind: ServiceKind;
  protocol: ServiceProtocol;
  system: string | null;
  base_url: string;
  datapower_domain: string | null;
  operations: string[];
}

/** Relaciones de un servicio (RPC service_links). */
export interface ServiceLinks {
  /** Servicios destino de sus operaciones por id; null si el servicio ya no existe. */
  targets: Record<
    string,
    { id: string; title: string; protocol: ServiceProtocol; base_url: string } | null
  >;
  /** Operaciones de otros servicios (p. ej. un DataPower) que llaman a este. */
  exposedBy: {
    id: string;
    title: string;
    kind: ServiceKind;
    protocol: ServiceProtocol;
    datapower_domain: string | null;
    operation: string;
    target_operation: string | null;
  }[];
  /** Conexiones de los objetos de BD que usan sus operaciones; null si se borró. */
  databases: Record<
    string,
    { id: string; title: string; engine: string; environment: string } | null
  >;
}

/** Versión de listado: sin credenciales ni operaciones completas. */
export interface ServiceSummary extends BaseResource {
  kind: ServiceKind;
  system: string | null;
  protocol: ServiceProtocol;
  base_url: string;
  datapower_domain: string | null;
}

export interface Service extends ServiceSummary {
  wsdl_url: string | null;
  datapower_object: string | null;
  auth_type: ServiceAuthType;
  auth_username: string | null;
  auth_secret: string | null;
  auth_notes: string | null;
  notes: string | null;
  operations: ServiceOperation[];
  soapui_file_path: string | null;
  soapui_file_name: string | null;
  soapui_file_size: number | null;
}

export interface ServiceInput extends BaseResourceInput {
  kind: ServiceKind;
  system?: string | null;
  protocol: ServiceProtocol;
  base_url: string;
  wsdl_url?: string | null;
  datapower_domain?: string | null;
  datapower_object?: string | null;
  auth_type: ServiceAuthType;
  auth_username?: string | null;
  auth_secret?: string | null;
  auth_notes?: string | null;
  notes?: string | null;
  operations: ServiceOperation[];
}

/** Campos del archivo SoapUI: los fija el servicio de datos tras subir el archivo. */
export interface ServiceRecordInput extends ServiceInput {
  soapui_file_path?: string | null;
  soapui_file_name?: string | null;
  soapui_file_size?: number | null;
}

export interface ServiceFilters {
  kind?: ServiceKind;
  protocol?: ServiceProtocol;
  system?: string;
}

export function serviceProtocolLabel(protocol: string): string {
  return SERVICE_PROTOCOLS.find((item) => item.value === protocol)?.label ?? protocol;
}

export function serviceAuthTypeLabel(type: string): string {
  return SERVICE_AUTH_TYPES.find((item) => item.value === type)?.label ?? type;
}

/** URL completa de una operación: base + recurso + query params. */
export function operationUrl(baseUrl: string, operation: ServiceOperation): string {
  const path = operation.path?.trim() ?? '';
  let url = baseUrl.trim();
  if (path) {
    url = /^https?:\/\//i.test(path)
      ? path
      : `${url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }
  const params = (operation.query_params ?? []).filter((param) => param.name.trim());
  if (params.length > 0) {
    const query = params
      .map((param) => `${encodeURIComponent(param.name.trim())}=${encodeURIComponent(param.value)}`)
      .join('&');
    url += (url.includes('?') ? '&' : '?') + query;
  }
  return url;
}

/** Lenguaje de resaltado para un cuerpo según el media type (o el protocolo). */
export function bodyLanguage(mediaType: string | null | undefined, protocol: string): string {
  const type = (mediaType ?? '').toLowerCase();
  if (type.includes('json')) {
    return 'json';
  }
  if (type.includes('xml') || (!type && protocol === 'soap')) {
    return 'xml';
  }
  return type ? 'plaintext' : 'json';
}

/** Media type efectivo: el de la operación o el habitual del protocolo. */
export function effectiveMediaType(operation: ServiceOperation, protocol: string): string {
  return (
    operation.media_type?.trim() ||
    (protocol === 'soap' ? 'text/xml; charset=utf-8' : 'application/json')
  );
}

/** Comillas simples para bash: 'a'\''b'. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface CurlOptions {
  /** Incluir las credenciales guardadas (Basic, Bearer o API key). */
  includeCredentials: boolean;
}

/**
 * Comando curl (sintaxis bash: Git Bash, WSL, Linux, macOS) equivalente a la
 * operación: método, URL, headers, credenciales y body.
 */
export function buildCurl(
  service: Pick<Service, 'base_url' | 'protocol' | 'auth_type' | 'auth_username' | 'auth_secret'>,
  operation: ServiceOperation,
  options: CurlOptions,
): string {
  const lines = [
    `curl -X ${operation.method} ${shellQuote(operationUrl(service.base_url, operation))}`,
  ];
  const headers = (operation.headers ?? []).filter((header) => header.name.trim());
  const hasHeader = (name: string) =>
    headers.some((header) => header.name.trim().toLowerCase() === name.toLowerCase());

  const body = operation.request_body ?? '';
  const sendsBody = body.trim() !== '' && operation.method !== 'GET' && operation.method !== 'HEAD';
  if (sendsBody && !hasHeader('content-type')) {
    lines.push(
      `-H ${shellQuote(`Content-Type: ${effectiveMediaType(operation, service.protocol)}`)}`,
    );
  }
  if (operation.soap_action?.trim() && !hasHeader('soapaction')) {
    lines.push(`-H ${shellQuote(`SOAPAction: "${operation.soap_action.trim()}"`)}`);
  }
  for (const header of headers) {
    lines.push(`-H ${shellQuote(`${header.name.trim()}: ${header.value}`)}`);
  }

  if (options.includeCredentials && !hasHeader('authorization')) {
    const user = service.auth_username ?? '';
    const secret = service.auth_secret ?? '';
    if (service.auth_type === 'basic' && (user || secret)) {
      lines.push(`-u ${shellQuote(`${user}:${secret}`)}`);
    } else if (service.auth_type === 'bearer' && secret) {
      lines.push(`-H ${shellQuote(`Authorization: Bearer ${secret}`)}`);
    } else if (service.auth_type === 'api_key' && user && secret && !hasHeader(user)) {
      lines.push(`-H ${shellQuote(`${user}: ${secret}`)}`);
    }
  }

  if (sendsBody) {
    lines.push(`--data-raw ${shellQuote(body)}`);
  }
  return lines.join(' \\\n  ');
}

export type SoapUiFileValidation = { valid: true } | { valid: false; message: string };

/** Validación rápida del proyecto SoapUI (extensión y tamaño); la firma la comprueba el servicio. */
export function validateSoapUiFile(file: File): SoapUiFileValidation {
  if (!/\.xml$/i.test(file.name)) {
    return { valid: false, message: 'El proyecto SoapUI debe ser un archivo .xml.' };
  }
  if (file.size <= 0) {
    return { valid: false, message: 'El archivo está vacío.' };
  }
  if (file.size > SERVICE_LIMITS.soapUiMaxBytes) {
    return { valid: false, message: 'El archivo supera el tamaño máximo de 50 MB.' };
  }
  return { valid: true };
}
