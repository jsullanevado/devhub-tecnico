import { DatabaseEngine } from '../../../core/models';

/** Datos detectados en un texto de conexión pegado por el usuario. */
export interface ParsedConnection {
  /** Texto de conexión sin la línea de credenciales. */
  connectionString: string;
  alias?: string;
  engine?: DatabaseEngine;
  host?: string;
  port?: number;
  serviceName?: string;
  username?: string;
  password?: string;
}

/** Línea de credenciales al estilo "##usuario/contraseña" (comentario en tnsnames). */
const CREDENTIALS_LINE = /^\s*#+\s*([^\s/#]+)\s*\/\s*(\S+)\s*$/;
/** "usuario/contraseña@destino" (SQL*Plus). */
const SQLPLUS_LOGIN = /^\s*([^\s/@]+)\/([^\s@]+)@(\S+)\s*$/;

const TNS_ALIAS = /^\s*([A-Za-z0-9_.$-]+)\s*=\s*\(/m;
const TNS_HOST = /\(\s*HOST\s*=\s*([^)\s]+)\s*\)/i;
const TNS_PORT = /\(\s*PORT\s*=\s*(\d+)\s*\)/i;
const TNS_SERVICE = /\(\s*(?:SERVICE_NAME|SID)\s*=\s*([^)\s]+)\s*\)/i;

const JDBC_ORACLE = /jdbc:oracle:thin:@(?:\/\/)?([^:/\s]+):(\d+)[:/]([^\s?;]+)/i;
const JDBC_SQLSERVER = /jdbc:sqlserver:\/\/([^:;/\s]+)(?::(\d+))?[^\s]*?databaseName=([^;\s]+)/i;
const JDBC_URL = /jdbc:(postgresql|mysql|mariadb):\/\/([^:/\s]+)(?::(\d+))?\/([^\s?;]+)/i;
/** EZConnect de Oracle: host:puerto/servicio (con o sin // delante). */
const EZCONNECT = /^(?:\/\/)?([A-Za-z0-9_.-]+):(\d+)\/([A-Za-z0-9_.$-]+)$/;

/**
 * Extrae alias, host, puerto, servicio y credenciales de lo que se suele copiar:
 * entradas de tnsnames.ora (con o sin "##usuario/clave" encima), URLs JDBC,
 * EZConnect (host:1521/SERVICIO) o "usuario/clave@destino". Solo devuelve lo que encuentra.
 */
export function parseConnectionText(text: string): ParsedConnection {
  const result: Partial<ParsedConnection> = {};
  const kept: string[] = [];

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const credentials = !result.username ? CREDENTIALS_LINE.exec(line) : null;
    if (credentials) {
      result.username = credentials[1];
      result.password = credentials[2];
      continue;
    }
    kept.push(line);
  }
  let connectionString = kept.join('\n').trim();

  const login = SQLPLUS_LOGIN.exec(connectionString);
  if (login) {
    result.username ??= login[1];
    result.password ??= login[2];
    connectionString = login[3];
  }

  if (/\(\s*DESCRIPTION/i.test(connectionString)) {
    result.engine = 'oracle';
    result.alias = TNS_ALIAS.exec(connectionString)?.[1];
    result.host = TNS_HOST.exec(connectionString)?.[1];
    result.port = toPort(TNS_PORT.exec(connectionString)?.[1]);
    result.serviceName = TNS_SERVICE.exec(connectionString)?.[1];
  } else if (JDBC_ORACLE.test(connectionString)) {
    const [, host, port, service] = JDBC_ORACLE.exec(connectionString)!;
    Object.assign(result, { engine: 'oracle', host, port: toPort(port), serviceName: service });
  } else if (JDBC_SQLSERVER.test(connectionString)) {
    const [, host, port, database] = JDBC_SQLSERVER.exec(connectionString)!;
    Object.assign(result, {
      engine: 'sqlserver',
      host,
      port: toPort(port),
      serviceName: database,
    });
  } else if (JDBC_URL.test(connectionString)) {
    const [, kind, host, port, database] = JDBC_URL.exec(connectionString)!;
    Object.assign(result, {
      engine: kind.toLowerCase() === 'postgresql' ? 'postgresql' : 'mysql',
      host,
      port: toPort(port),
      serviceName: database,
    });
  } else if (EZCONNECT.test(connectionString)) {
    const [, host, port, service] = EZCONNECT.exec(connectionString)!;
    Object.assign(result, { engine: 'oracle', host, port: toPort(port), serviceName: service });
  }

  return Object.fromEntries(
    Object.entries({ ...result, connectionString }).filter(([, value]) => value !== undefined),
  ) as unknown as ParsedConnection;
}

/** "usuario/contraseña@//host:puerto/servicio" para SQL*Plus o SQLcl (solo Oracle). */
export function sqlplusConnectString(connection: {
  username: string | null;
  password: string | null;
  host: string | null;
  port: number | null;
  service_name: string | null;
}): string | null {
  const { username, password, host, port, service_name } = connection;
  if (!username || !password || !host || !service_name) {
    return null;
  }
  return `${username}/${password}@//${host}:${port ?? 1521}/${service_name}`;
}

function toPort(value: string | undefined): number | undefined {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
}
