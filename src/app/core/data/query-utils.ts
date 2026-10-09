/** Configuración FTS creada en la Etapa 1 (español + sin tildes). */
export const FTS_CONFIG = 'spanish_unaccent';

/** Columnas del autor para incrustar en los recursos (FK owner_id → profiles). */
export const AUTHOR_EMBED = 'author:profiles(id, username, full_name, avatar_url)';

/** Escapa comodines de LIKE/ILIKE para búsquedas literales. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Elimina claves con valor undefined para no enviarlas a la API. */
export function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
