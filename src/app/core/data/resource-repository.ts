import { inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../auth/auth.service';
import { AppError } from '../errors/app-error';
import { DEFAULT_ERROR_MESSAGES, toAppError } from '../errors/error-mapper';
import {
  BaseResource,
  BaseResourceInput,
  normalizeTags,
  Page,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  ResourceListQuery,
} from '../models';
import { SUPABASE } from '../supabase/supabase.client';
import { clamp, FTS_CONFIG, isUuid, withoutUndefined } from './query-utils';

export type ResourceTable = 'scripts' | 'lessons_learned' | 'notes' | 'manuals';

/** Filtro declarativo que cada repositorio traduce desde sus filtros tipados. */
export interface FilterCondition {
  column: string;
  operator: 'eq' | 'ilike';
  value: string | number | boolean;
}

/**
 * CRUD común de los cuatro tipos de recurso (listado paginado con búsqueda,
 * etiquetas y filtros; detalle; alta; edición; borrado).
 *
 * Decisión de tipado: la tabla es un parámetro de la subclase, y el tipado
 * genérico de supabase-js no puede resolver columnas sobre una tabla genérica.
 * Por eso las consultas usan aquí un cliente sin esquema y los resultados se
 * tipan en la API pública (TSummary/TDetail), cuyas columnas se declaran
 * explícitamente en cada subclase. Los servicios específicos usan el cliente tipado.
 */
export abstract class ResourceRepository<
  TSummary extends BaseResource,
  TDetail extends TSummary,
  TInput extends BaseResourceInput,
  TFilters extends object,
> {
  protected readonly supabase = inject(SUPABASE);
  protected readonly auth = inject(AuthService);

  protected abstract readonly table: ResourceTable;
  /** Columnas para listados (sin campos de texto largos). */
  protected abstract readonly summaryColumns: string;
  /** Columnas para el detalle. */
  protected abstract readonly detailColumns: string;
  protected abstract toConditions(filters: TFilters): FilterCondition[];

  private get db(): SupabaseClient {
    return this.supabase as unknown as SupabaseClient;
  }

  async list(query: ResourceListQuery<TFilters> = {}): Promise<Page<TSummary>> {
    const pageSize = clamp(Math.floor(query.pageSize ?? PAGE_SIZE_DEFAULT), 1, PAGE_SIZE_MAX);
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const from = (page - 1) * pageSize;

    let builder = this.db
      .from(this.table)
      .select<string, TSummary>(this.summaryColumns, { count: 'exact' });

    if (query.scope === 'mine') {
      builder = builder.eq('owner_id', this.requireUserId());
    } else if (query.scope === 'public') {
      builder = builder.eq('visibility', 'public');
    }

    const tags = normalizeTags(query.tags ?? []);
    if (tags.length > 0) {
      builder = builder.contains('tags', tags);
    }

    const search = query.search?.trim();
    if (search) {
      builder = builder.textSearch('search_vector', search, {
        type: 'websearch',
        config: FTS_CONFIG,
      });
    }

    for (const condition of query.filters ? this.toConditions(query.filters) : []) {
      builder =
        condition.operator === 'eq'
          ? builder.eq(condition.column, condition.value)
          : builder.ilike(condition.column, String(condition.value));
    }

    const sort = query.sort ?? 'updated_at';
    builder = builder.order(sort, { ascending: query.ascending ?? sort === 'title' }).order('id');

    const { data, error, count } = await builder.range(from, from + pageSize - 1);
    if (error) {
      // PGRST103: página fuera de rango (p. ej. tras borrar el último elemento).
      if (error.code === 'PGRST103') {
        return { items: [], total: count ?? 0, page, pageSize };
      }
      throw toAppError(error);
    }
    return { items: data ?? [], total: count ?? 0, page, pageSize };
  }

  /** Recursos visibles que comparten alguna etiqueta (navegación entre contenidos). */
  async listRelated(id: string, tags: readonly string[], limit = 5): Promise<TSummary[]> {
    const normalized = normalizeTags(tags);
    if (normalized.length === 0) {
      return [];
    }
    const { data, error } = await this.db
      .from(this.table)
      .select<string, TSummary>(this.summaryColumns)
      .overlaps('tags', normalized)
      .neq('id', id)
      .order('updated_at', { ascending: false })
      .limit(clamp(limit, 1, 20));
    if (error) {
      throw toAppError(error);
    }
    return data ?? [];
  }

  async getById(id: string): Promise<TDetail> {
    this.assertId(id);
    const { data, error } = await this.db
      .from(this.table)
      .select<string, TDetail>(this.detailColumns)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw toAppError(error);
    }
    if (!data) {
      throw new AppError('not_found', DEFAULT_ERROR_MESSAGES.not_found);
    }
    return data;
  }

  async create(input: TInput): Promise<TDetail> {
    const { data, error } = await this.db
      .from(this.table)
      .insert(this.toPayload(input))
      .select<string, TDetail>(this.detailColumns)
      .single();
    if (error) {
      throw toAppError(error);
    }
    return data;
  }

  /** RLS solo deja actualizar recursos propios: 0 filas = no existe o no es tuyo. */
  async update(id: string, changes: Partial<TInput>): Promise<TDetail> {
    this.assertId(id);
    const payload = this.toPayload(changes);
    if (Object.keys(payload).length === 0) {
      return this.getById(id);
    }
    const { data, error } = await this.db
      .from(this.table)
      .update(payload)
      .eq('id', id)
      .select<string, TDetail>(this.detailColumns)
      .maybeSingle();
    if (error) {
      throw toAppError(error);
    }
    if (!data) {
      throw new AppError(
        'not_found',
        'El recurso no existe o no tienes permisos para modificarlo.',
      );
    }
    return data;
  }

  async delete(id: string): Promise<void> {
    await this.deleteReturning(id, 'id');
  }

  /** Borra y devuelve las columnas indicadas de la fila eliminada. */
  protected async deleteReturning(id: string, columns: string): Promise<Record<string, unknown>> {
    this.assertId(id);
    const { data, error } = await this.db
      .from(this.table)
      .delete()
      .eq('id', id)
      .select<string, Record<string, unknown>>(columns)
      .maybeSingle();
    if (error) {
      throw toAppError(error);
    }
    if (!data) {
      throw new AppError('not_found', 'El recurso no existe o no tienes permisos para eliminarlo.');
    }
    return data;
  }

  protected requireUserId(): string {
    const userId = this.auth.userId();
    if (!userId) {
      throw new AppError('unauthenticated', DEFAULT_ERROR_MESSAGES.unauthenticated);
    }
    return userId;
  }

  /** Un id con formato inválido (p. ej. URL manipulada) se trata como "no encontrado". */
  private assertId(id: string): void {
    if (!isUuid(id)) {
      throw new AppError('not_found', DEFAULT_ERROR_MESSAGES.not_found);
    }
  }

  private toPayload(input: Partial<TInput>): Record<string, unknown> {
    const payload: Record<string, unknown> = withoutUndefined(input);
    if (Array.isArray(payload['tags'])) {
      payload['tags'] = normalizeTags(payload['tags'] as string[]);
    }
    return payload;
  }
}
