import { DATABASE_ENGINES, DATABASE_ENVIRONMENTS, DatabaseFilters } from '../../core/models';
import { FilterCodec, oneOf } from '../../shared/resources/list-query';

export const DATABASE_ENGINE_VALUES = DATABASE_ENGINES.map((item) => item.value);
export const DATABASE_ENVIRONMENT_VALUES = DATABASE_ENVIRONMENTS.map((item) => item.value);

/** Filtros de bases de datos en la URL: ?engine=oracle&environment=prod */
export const DATABASE_FILTER_CODEC: FilterCodec<DatabaseFilters> = {
  parse: (params) => ({
    engine: oneOf(params.get('engine'), DATABASE_ENGINE_VALUES),
    environment: oneOf(params.get('environment'), DATABASE_ENVIRONMENT_VALUES),
  }),
  toParams: (filters) => ({
    engine: filters.engine ?? null,
    environment: filters.environment ?? null,
  }),
};

const ENVIRONMENT_CLASSES: Record<string, string> = {
  dev: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
  qa: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  prod: 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300',
};

/** Color del entorno: producción en rojo para que destaque. */
export function environmentBadgeClass(environment: string): string {
  return ENVIRONMENT_CLASSES[environment] ?? '';
}

/** host:puerto/servicio (lo que haya) para listados y detalle. */
export function connectionTarget(database: {
  host: string | null;
  port: number | null;
  service_name: string | null;
}): string | null {
  if (!database.host) {
    return null;
  }
  return (
    database.host +
    (database.port ? `:${database.port}` : '') +
    (database.service_name ? `/${database.service_name}` : '')
  );
}
