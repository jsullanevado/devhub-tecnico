import { BaseResource, BaseResourceInput } from './common.models';

export const DATABASE_ENGINES = [
  { value: 'oracle', label: 'Oracle' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL / MariaDB' },
  { value: 'other', label: 'Otro' },
] as const;
export type DatabaseEngine = (typeof DATABASE_ENGINES)[number]['value'];

export const DATABASE_ENVIRONMENTS = [
  { value: 'dev', label: 'Desarrollo' },
  { value: 'qa', label: 'QA / Certificación' },
  { value: 'prod', label: 'Producción' },
  { value: 'other', label: 'Otro' },
] as const;
export type DatabaseEnvironment = (typeof DATABASE_ENVIRONMENTS)[number]['value'];

/** Puerto por defecto de cada motor (se propone al elegirlo). */
export const DEFAULT_PORT_BY_ENGINE: Record<DatabaseEngine, number | null> = {
  oracle: 1521,
  sqlserver: 1433,
  postgresql: 5432,
  mysql: 3306,
  other: null,
};

/** Igual que los CHECK de la tabla `databases` (migración 20261013000000). */
export const DATABASE_LIMITS = {
  hostMax: 255,
  serviceNameMax: 128,
  connectionStringMax: 10_000,
  usernameMax: 200,
  passwordMax: 4000,
  notesMax: 20_000,
} as const;

/** Tipos de objeto de una base de datos (igual que private.database_objects_valid). */
export const DATABASE_OBJECT_TYPES = [
  { value: 'package', label: 'Package', short: 'PKG' },
  { value: 'procedure', label: 'Procedimiento', short: 'SP' },
  { value: 'function', label: 'Función', short: 'FN' },
  { value: 'table', label: 'Tabla', short: 'TAB' },
  { value: 'view', label: 'Vista', short: 'VW' },
  { value: 'sequence', label: 'Secuencia', short: 'SEQ' },
  { value: 'trigger', label: 'Trigger', short: 'TRG' },
  { value: 'type', label: 'Tipo', short: 'TYP' },
  { value: 'other', label: 'Otro', short: 'OBJ' },
] as const;
export type DatabaseObjectType = (typeof DATABASE_OBJECT_TYPES)[number]['value'];

export const DATABASE_OBJECT_LIMITS = {
  objectsMax: 500,
  schemaMax: 128,
  nameMax: 128,
  descriptionMax: 5000,
  codeMax: 1_000_000,
  membersMax: 500,
} as const;

/** Tabla, package (con sus SP y funciones en members), vista… de una conexión. */
export interface DatabaseObject {
  type: DatabaseObjectType;
  schema?: string | null;
  name: string;
  description?: string | null;
  /** Procedimientos y funciones de un package. */
  members?: string[];
  /** DDL, spec y body, etc. */
  code?: string | null;
}

/** Conexión con sus objetos (sin código) para el selector de una operación. */
export interface DatabaseCatalogItem {
  id: string;
  title: string;
  engine: DatabaseEngine;
  environment: DatabaseEnvironment;
  objects: Pick<DatabaseObject, 'type' | 'schema' | 'name' | 'members'>[];
}

/** Operación de un servicio que usa un objeto de la conexión (RPC database_used_by). */
export interface DatabaseObjectUsage {
  id: string;
  title: string;
  protocol: string;
  datapower_domain: string | null;
  operation: string;
  object: string;
  member: string | null;
}

/** ESQUEMA.NOMBRE (o solo NOMBRE): así se referencia el objeto desde un servicio. */
export function databaseObjectKey(object: { schema?: string | null; name: string }): string {
  return object.schema ? `${object.schema}.${object.name}` : object.name;
}

export function databaseObjectTypeShort(type: string): string {
  return DATABASE_OBJECT_TYPES.find((item) => item.value === type)?.short ?? 'OBJ';
}

export function databaseObjectTypeLabel(type: string): string {
  return DATABASE_OBJECT_TYPES.find((item) => item.value === type)?.label ?? type;
}

/** Versión de listado: sin cadena completa ni credenciales. */
export interface DatabaseSummary extends BaseResource {
  engine: DatabaseEngine;
  environment: DatabaseEnvironment;
  host: string | null;
  port: number | null;
  service_name: string | null;
}

export interface DatabaseConnection extends DatabaseSummary {
  connection_string: string | null;
  username: string | null;
  password: string | null;
  notes: string | null;
  objects: DatabaseObject[];
}

export interface DatabaseInput extends BaseResourceInput {
  engine: DatabaseEngine;
  environment: DatabaseEnvironment;
  host?: string | null;
  port?: number | null;
  service_name?: string | null;
  connection_string?: string | null;
  username?: string | null;
  password?: string | null;
  notes?: string | null;
  objects?: DatabaseObject[];
}

export interface DatabaseFilters {
  engine?: DatabaseEngine;
  environment?: DatabaseEnvironment;
}

export function databaseEngineLabel(engine: string): string {
  return DATABASE_ENGINES.find((item) => item.value === engine)?.label ?? engine;
}

export function databaseEnvironmentLabel(environment: string): string {
  return DATABASE_ENVIRONMENTS.find((item) => item.value === environment)?.label ?? environment;
}
