import {
  databaseEnvironmentLabel,
  databaseObjectKey,
  databaseObjectTypeShort,
  GraphDatabase,
  GraphOperation,
  GraphService,
  RelationsGraph,
  serviceProtocolLabel,
  ServiceDbRef,
  ServiceOperationTarget,
} from '../../core/models';

/** DataPower si tiene dominio; si no, REST o SOAP. */
export function serviceKind(service: Pick<GraphService, 'kind' | 'protocol'>): string {
  return service.kind === 'datapower' ? 'DataPower' : serviceProtocolLabel(service.protocol);
}

/** Mismo objeto sin distinguir mayúsculas; "PKG_X" coincide con "ESQUEMA.PKG_X". */
export function sameObject(reference: string, key: string): boolean {
  const ref = reference.trim().toUpperCase();
  const full = key.trim().toUpperCase();
  return ref === full || full.endsWith('.' + ref) || ref.endsWith('.' + full);
}

class GraphIndex {
  readonly services: Map<string, GraphService>;
  readonly databases: Map<string, GraphDatabase>;

  constructor(graph: RelationsGraph) {
    this.services = new Map(graph.services.map((service) => [service.id, service]));
    this.databases = new Map(graph.databases.map((database) => [database.id, database]));
  }

  /** Operaciones del destino: la indicada o, si no se indicó (o no existe), todas. */
  targetOperations(target: ServiceOperationTarget): GraphOperation[] {
    const service = this.services.get(target.service_id);
    if (!service) {
      return [];
    }
    const name = target.operation?.trim().toLowerCase();
    const named = name
      ? service.operations.filter((op) => op.name.trim().toLowerCase() === name)
      : [];
    return named.length ? named : service.operations;
  }

  findObject(ref: ServiceDbRef) {
    return this.databases
      .get(ref.database_id)
      ?.objects.find((object) => sameObject(ref.object, databaseObjectKey(object)));
  }
}

// --- Reporte por operación -----------------------------------------------------------------

export interface TraceRow {
  serviceId: string;
  service: string;
  kind: string;
  system: string;
  operation: string;
  method: string;
  /** Servicios (y operación) por los que pasa hasta llegar a la BD: "svcA · op → svcB · op". */
  route: string;
  /** Primer servicio de la ruta (para el enlace). */
  targetId: string | null;
  databaseId: string | null;
  database: string;
  environment: string;
  objectType: string;
  object: string;
  member: string;
}

/**
 * Una fila por cada objeto de BD al que llega cada operación (directamente o a través
 * de los servicios a los que llama) y por cada servicio destino que no llega a ninguna BD;
 * una fila vacía si la operación no llama a nada.
 */
export function buildTraceRows(graph: RelationsGraph): TraceRow[] {
  const index = new GraphIndex(graph);
  const rows: TraceRow[] = [];

  for (const service of graph.services) {
    for (const operation of service.operations) {
      const base = {
        serviceId: service.id,
        service: service.title,
        kind: serviceKind(service),
        system: service.system ?? '',
        operation: operation.name,
        method: operation.method,
      };
      const reached = collectPaths(index, operation, new Set([service.id]));
      if (!reached.length) {
        reached.push({ ref: null, route: '', targetId: null });
      }
      for (const { ref, route, targetId } of reached) {
        const database = ref ? index.databases.get(ref.database_id) : undefined;
        const object = ref ? index.findObject(ref) : undefined;
        rows.push({
          ...base,
          route,
          targetId,
          databaseId: database ? database.id : null,
          database: ref ? (database?.title ?? '(conexión borrada)') : '',
          environment: database ? databaseEnvironmentLabel(database.environment) : '',
          objectType: object ? databaseObjectTypeShort(object.type) : '',
          object: ref?.object ?? '',
          member: ref?.member ?? '',
        });
      }
    }
  }
  return rows;
}

interface ReachedPath {
  /** Objeto de BD al final de la ruta; null si la ruta acaba en un servicio sin BD. */
  ref: ServiceDbRef | null;
  route: string;
  targetId: string | null;
}

/**
 * Rutas de una operación: sus objetos de BD y, por cada servicio al que llama (sin ciclos),
 * los objetos a los que llega ese servicio o el propio servicio si no llega a ninguno.
 */
function collectPaths(
  index: GraphIndex,
  operation: GraphOperation,
  visited: Set<string>,
  route = '',
  targetId: string | null = null,
): ReachedPath[] {
  const result: ReachedPath[] = operation.db_refs.map((ref) => ({ ref, route, targetId }));
  for (const target of operation.targets) {
    const service = index.services.get(target.service_id);
    const hop = service
      ? target.operation
        ? `${service.title} · ${target.operation}`
        : service.title
      : '(servicio borrado)';
    const firstId = targetId ?? (service ? service.id : null);
    const hopRoute = route ? `${route} → ${hop}` : hop;
    if (service && visited.has(service.id)) {
      continue; // Llamada circular: esa ruta ya se recorrió.
    }
    const sub: ReachedPath[] = [];
    if (service) {
      const next = new Set(visited).add(service.id);
      for (const op of index.targetOperations(target)) {
        const opRoute = route
          ? `${route} → ${service.title} · ${op.name}`
          : `${service.title} · ${op.name}`;
        sub.push(...collectPaths(index, op, next, opRoute, firstId));
      }
    }
    result.push(...(sub.length ? sub : [{ ref: null, route: hopRoute, targetId: firstId }]));
  }
  // Sin repetir el mismo objeto/SP de la misma conexión ni la misma ruta sin BD.
  const seen = new Set<string>();
  return result.filter(({ ref, route: path }) => {
    const key = ref
      ? `${ref.database_id}|${ref.object.toUpperCase()}|${(ref.member ?? '').toUpperCase()}`
      : `ruta|${path}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// --- Reporte por objeto de BD -------------------------------------------------------------

export interface ObjectRow {
  databaseId: string;
  database: string;
  environment: string;
  objectType: string;
  object: string;
  member: string;
  description: string;
  /** "servicio · operación" que lo usan directamente. */
  usedBy: { serviceId: string; label: string }[];
}

/** Una fila por objeto (y por cada SP de un package) de cada conexión, con quién lo usa. */
export function buildObjectRows(graph: RelationsGraph): ObjectRow[] {
  const refs = graph.services.flatMap((service) =>
    service.operations.flatMap((operation) =>
      operation.db_refs.map((ref) => ({
        ref,
        serviceId: service.id,
        label: `${service.title} · ${operation.name}`,
      })),
    ),
  );
  const rows: ObjectRow[] = [];
  for (const database of graph.databases) {
    const environment = databaseEnvironmentLabel(database.environment);
    for (const object of database.objects) {
      const key = databaseObjectKey(object);
      const users = refs.filter(
        ({ ref }) => ref.database_id === database.id && sameObject(ref.object, key),
      );
      const base = {
        databaseId: database.id,
        database: database.title,
        environment,
        objectType: databaseObjectTypeShort(object.type),
        object: key,
        description: object.description ?? '',
      };
      const usedBy = (member: string) =>
        users
          .filter(({ ref }) => (ref.member ?? '').toUpperCase() === member.toUpperCase())
          .map(({ serviceId, label }) => ({ serviceId, label }));
      rows.push({ ...base, member: '', usedBy: usedBy('') });
      for (const member of object.members) {
        rows.push({ ...base, member, usedBy: usedBy(member) });
      }
    }
  }
  return rows;
}

// --- Árbol de dependencias -----------------------------------------------------------------

export type TreeNodeKind = 'service' | 'operation' | 'database' | 'object' | 'member' | 'warning';

export interface TreeNode {
  kind: TreeNodeKind;
  label: string;
  badge?: string;
  /** Texto secundario corto (ruta abreviada, dominio…). */
  detail?: string;
  /** Texto completo para el tooltip (URL, ruta o descripción enteras). */
  title?: string;
  /** Rama incompleta: "sin BD" o "sin destino". */
  flag?: string;
  link?: string[];
  children: TreeNode[];
}

/** "/v1.0/MIG1/service_Domain/svcProblem/usos/consulta" → "…/usos/consulta". */
export function shortPath(path: string | null | undefined, max = 40): string | undefined {
  if (!path) {
    return undefined;
  }
  if (path.length <= max) {
    return path;
  }
  const parts = path.split('/').filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path;
}

/** URL larga → "host/…/último-tramo". */
export function shortUrl(url: string, max = 45): string {
  if (url.length <= max) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.length > 1
      ? `${parsed.host}/…/${parts[parts.length - 1]}`
      : parsed.host + parsed.pathname;
  } catch {
    return url;
  }
}

/** Servicio → operaciones → servicio destino → … → conexión → objeto → SP. */
export function buildServiceTree(graph: RelationsGraph, serviceId: string): TreeNode | null {
  const index = new GraphIndex(graph);
  const service = index.services.get(serviceId);
  return service ? serviceNode(index, service, service.operations, new Set()) : null;
}

/** ¿Llega a algo (destino u objeto de BD) alguna operación? */
export function hasRelations(graph: RelationsGraph, serviceId: string): boolean {
  const service = graph.services.find((item) => item.id === serviceId);
  return !!service?.operations.some((op) => op.targets.length || op.db_refs.length);
}

function serviceNode(
  index: GraphIndex,
  service: GraphService,
  operations: GraphOperation[],
  visited: Set<string>,
): TreeNode {
  const path = new Set(visited).add(service.id);
  return {
    kind: 'service',
    label: service.title,
    badge: serviceKind(service),
    detail:
      (service.kind === 'datapower' && service.datapower_domain) || shortUrl(service.base_url),
    title: service.base_url,
    link: ['/services', service.id],
    children: operations.map((operation) =>
      operationNode(index, operation, path, service.kind === 'datapower'),
    ),
  };
}

function operationNode(
  index: GraphIndex,
  operation: GraphOperation,
  visited: Set<string>,
  dataPower: boolean,
): TreeNode {
  const children: TreeNode[] = [];
  for (const target of operation.targets) {
    const service = index.services.get(target.service_id);
    if (!service) {
      children.push(warning('Servicio destino no encontrado (se borró)'));
    } else if (visited.has(service.id)) {
      children.push(warning(`${service.title}: llamada circular, no se repite`));
    } else {
      children.push(serviceNode(index, service, index.targetOperations(target), visited));
    }
  }
  children.push(...databaseNodes(index, operation.db_refs));
  return {
    kind: 'operation',
    label: operation.name,
    badge: operation.method,
    detail: shortPath(operation.soap_action ?? operation.path),
    title: operation.soap_action ?? operation.path ?? undefined,
    // Rama que termina aquí: no enruta a nada (DataPower) o no llega a una BD.
    flag: children.length ? undefined : dataPower ? 'sin destino' : 'sin BD',
    children,
  };
}

/** Agrupa las referencias por conexión y por objeto. */
function databaseNodes(index: GraphIndex, refs: ServiceDbRef[]): TreeNode[] {
  const byDatabase = new Map<string, ServiceDbRef[]>();
  for (const ref of refs) {
    byDatabase.set(ref.database_id, [...(byDatabase.get(ref.database_id) ?? []), ref]);
  }
  return [...byDatabase].map(([databaseId, databaseRefs]) => {
    const database = index.databases.get(databaseId);
    const byObject = new Map<string, ServiceDbRef[]>();
    for (const ref of databaseRefs) {
      const key = ref.object.trim().toUpperCase();
      byObject.set(key, [...(byObject.get(key) ?? []), ref]);
    }
    return {
      kind: 'database' as const,
      label: database?.title ?? 'Conexión no encontrada (se borró)',
      badge: database ? databaseEnvironmentLabel(database.environment) : undefined,
      detail: database
        ? [database.host, database.service_name].filter(Boolean).join(' / ') || undefined
        : undefined,
      link: database ? ['/databases', database.id] : undefined,
      children: [...byObject.values()].map((objectRefs) => {
        const object = index.findObject(objectRefs[0]);
        const members = [
          ...new Set(objectRefs.map((ref) => ref.member?.trim()).filter((m): m is string => !!m)),
        ];
        return {
          kind: 'object' as const,
          label: object ? databaseObjectKey(object) : objectRefs[0].object,
          badge: object ? databaseObjectTypeShort(object.type) : 'OBJ',
          detail: object?.description ?? (object ? undefined : 'no registrado en la conexión'),
          title: object?.description ?? undefined,
          children: members.map((member) => ({
            kind: 'member' as const,
            label: member,
            badge: member.toUpperCase().startsWith('FN') ? 'FN' : 'SP',
            children: [],
          })),
        };
      }),
    };
  });
}

function warning(label: string): TreeNode {
  return { kind: 'warning', label, children: [] };
}

/** Árbol como texto con sangría (para copiar a un correo o documento). */
export function treeToText(node: TreeNode, depth = 0): string {
  // El dato corto, salvo si está abreviado (…): entonces el completo.
  const detail = node.detail?.includes('…') ? node.title : node.detail;
  const line =
    '  '.repeat(depth) +
    (depth ? '└ ' : '') +
    (node.badge ? `[${node.badge}] ` : '') +
    node.label +
    (detail ? `  (${detail})` : '') +
    (node.flag ? ` ⚠ ${node.flag}` : '');
  return [line, ...node.children.map((child) => treeToText(child, depth + 1))].join('\n');
}

// --- CSV -------------------------------------------------------------------------------

/** CSV con ; (Excel en español) y BOM para que abra bien las tildes. */
export function toCsv(headers: string[], rows: string[][]): string {
  const cell = (value: string) =>
    /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return '﻿' + [headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}
