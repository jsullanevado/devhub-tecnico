import { DatabaseEngine, DatabaseEnvironment, DatabaseObjectType } from './database.models';
import {
  HttpMethod,
  ServiceDbRef,
  ServiceOperationTarget,
  ServiceKind,
  ServiceProtocol,
} from './service.models';

/** Operación en el grafo de relaciones (sin bodies ni headers). */
export interface GraphOperation {
  name: string;
  method: HttpMethod;
  path: string | null;
  soap_action: string | null;
  targets: ServiceOperationTarget[];
  db_refs: ServiceDbRef[];
}

export interface GraphService {
  id: string;
  title: string;
  kind: ServiceKind;
  protocol: ServiceProtocol;
  system: string | null;
  base_url: string;
  datapower_domain: string | null;
  operations: GraphOperation[];
}

export interface GraphDatabase {
  id: string;
  title: string;
  engine: DatabaseEngine;
  environment: DatabaseEnvironment;
  host: string | null;
  service_name: string | null;
  objects: {
    type: DatabaseObjectType;
    schema: string | null;
    name: string;
    description: string | null;
    members: string[];
  }[];
}

/** Todo lo necesario para reportes y árboles (RPC relations_graph). */
export interface RelationsGraph {
  services: GraphService[];
  databases: GraphDatabase[];
}
