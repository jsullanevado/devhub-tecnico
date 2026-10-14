import { Injectable } from '@angular/core';
import { toAppError } from '../errors/error-mapper';
import {
  DatabaseCatalogItem,
  DatabaseConnection,
  DatabaseFilters,
  DatabaseInput,
  DatabaseObjectUsage,
  DatabaseSummary,
} from '../models';
import { AUTHOR_EMBED } from './query-utils';
import { FilterCondition, ResourceRepository } from './resource-repository';

const SUMMARY_COLUMNS =
  'id, owner_id, title, description, engine, environment, host, port, service_name, tags, visibility, created_at, updated_at';

/**
 * Conexiones a bases de datos (cadena, host, servicio, usuario y contraseña) con sus
 * objetos. Las credenciales son visibles para quien pueda ver la fila (como en services).
 */
@Injectable({ providedIn: 'root' })
export class DatabasesService extends ResourceRepository<
  DatabaseSummary,
  DatabaseConnection,
  DatabaseInput,
  DatabaseFilters
> {
  protected readonly table = 'databases';
  protected readonly summaryColumns = `${SUMMARY_COLUMNS}, ${AUTHOR_EMBED}`;
  protected readonly detailColumns = `${SUMMARY_COLUMNS}, connection_string, username, password, notes, objects, ${AUTHOR_EMBED}`;

  protected toConditions(filters: DatabaseFilters): FilterCondition[] {
    const conditions: FilterCondition[] = [];
    if (filters.engine) {
      conditions.push({ column: 'engine', operator: 'eq', value: filters.engine });
    }
    if (filters.environment) {
      conditions.push({ column: 'environment', operator: 'eq', value: filters.environment });
    }
    return conditions;
  }

  /** Conexiones con sus objetos (sin código), para elegirlos desde una operación de servicio. */
  async catalog(): Promise<DatabaseCatalogItem[]> {
    const { data, error } = await this.supabase.rpc('databases_catalog');
    if (error) {
      throw toAppError(error);
    }
    return (data ?? []) as unknown as DatabaseCatalogItem[];
  }

  /** Operaciones de servicios que usan objetos de esta conexión. */
  async usedBy(id: string): Promise<DatabaseObjectUsage[]> {
    const { data, error } = await this.supabase.rpc('database_used_by', { p_database_id: id });
    if (error) {
      throw toAppError(error);
    }
    return (data ?? []) as unknown as DatabaseObjectUsage[];
  }
}
