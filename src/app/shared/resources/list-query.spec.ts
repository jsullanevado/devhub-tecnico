import { convertToParamMap } from '@angular/router';
import { FilterCodec, oneOf, parseListQuery, serializeListQuery } from './list-query';

interface DemoFilters {
  category?: 'a' | 'b';
}

const codec: FilterCodec<DemoFilters> = {
  parse: (params) => ({ category: oneOf(params.get('category'), ['a', 'b'] as const) }),
  toParams: (filters) => ({ category: filters.category ?? null }),
};

describe('parseListQuery', () => {
  it('usa valores por defecto sin parámetros', () => {
    expect(parseListQuery(convertToParamMap({}), codec)).toEqual({
      search: '',
      tags: [],
      scope: 'all',
      sort: 'updated_at',
      page: 1,
      filters: { category: undefined },
    });
  });

  it('lee y normaliza parámetros válidos', () => {
    const query = parseListQuery(
      convertToParamMap({
        q: ' oauth ',
        tags: 'SQL,oracle',
        scope: 'mine',
        page: '3',
        category: 'b',
      }),
      codec,
    );
    expect(query.search).toBe('oauth');
    expect(query.tags).toEqual(['oracle', 'sql']);
    expect(query.scope).toBe('mine');
    expect(query.page).toBe(3);
    expect(query.filters.category).toBe('b');
  });

  it('ignora valores manipulados o no válidos', () => {
    const query = parseListQuery(
      convertToParamMap({
        scope: 'admin',
        sort: 'drop',
        page: '-2',
        category: 'x',
        tags: 'con espacio',
      }),
      codec,
    );
    expect(query.scope).toBe('all');
    expect(query.sort).toBe('updated_at');
    expect(query.page).toBe(1);
    expect(query.filters.category).toBeUndefined();
    expect(query.tags).toEqual([]);
  });
});

describe('serializeListQuery', () => {
  it('omite los valores por defecto', () => {
    const params = serializeListQuery(
      { search: '', tags: [], scope: 'all', sort: 'updated_at', page: 1, filters: {} },
      codec,
    );
    expect(params).toEqual({});
  });

  it('es reversible con parseListQuery', () => {
    const original = {
      search: 'jwt',
      tags: ['auth', 'rest'],
      scope: 'public' as const,
      sort: 'title' as const,
      page: 2,
      filters: { category: 'a' as const },
    };
    const params = serializeListQuery(original, codec);
    expect(parseListQuery(convertToParamMap(params), codec)).toEqual(original);
  });
});
