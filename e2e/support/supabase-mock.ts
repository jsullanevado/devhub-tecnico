import { Page, Request, Route } from '@playwright/test';

/**
 * Supabase simulado para E2E. Responde a Auth, PostgREST (tablas y RPC) y
 * Storage con datos FICTICIOS en memoria, aislados por página.
 */

export const SUPABASE_URL = 'https://e2e-mock.supabase.co';
export const TEST_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'qa@devhub.test',
  password: 'Correcta123',
  fullName: 'Ana Prueba',
};

const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-01T10:00:00Z').toISOString();
const author = (id: string, name: string) => ({
  id,
  username: null,
  full_name: name,
  avatar_url: null,
});

export const SCRIPTS = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    owner_id: TEST_USER.id,
    title: 'Petición SOAP de autenticación',
    description: 'Plantilla ficticia de login SOAP',
    category: 'soap',
    language: 'xml',
    is_template: true,
    tags: ['auth', 'soap'],
    visibility: 'public',
    created_at: now,
    updated_at: now,
    content: '<soapenv:Envelope>LOGIN_DE_PRUEBA</soapenv:Envelope>',
    author: author(TEST_USER.id, TEST_USER.fullName),
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    owner_id: OTHER_USER,
    title: 'Consulta de clientes activos',
    description: 'SELECT de ejemplo',
    category: 'sql',
    language: 'sql',
    is_template: false,
    tags: ['sql'],
    visibility: 'public',
    created_at: now,
    updated_at: now,
    content: 'select * from clientes where activo = true;',
    author: author(OTHER_USER, 'Otro Usuario'),
  },
];

interface MockState {
  favorites: { id: string; script_id: string; created_at: string }[];
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
};

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function session() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: TEST_USER.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: TEST_USER.email,
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: TEST_USER.fullName },
    created_at: now,
  };
  const accessToken = [
    base64Url({ alg: 'HS256', typ: 'JWT' }),
    base64Url({
      sub: TEST_USER.id,
      role: 'authenticated',
      aud: 'authenticated',
      exp: expiresAt,
      email: TEST_USER.email,
      session_id: 'e2e',
    }),
    'firma-e2e',
  ].join('.');
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: 'refresh-e2e',
    user,
  };
}

function json(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
  });
}

/** PostgREST: una fila (single) o lista, según la cabecera Accept. */
function rows(route: Route, request: Request, items: unknown[]) {
  if (request.headers()['accept']?.includes('vnd.pgrst.object')) {
    return items.length === 1
      ? json(route, 200, items[0])
      : json(route, 406, { code: 'PGRST116', message: 'No rows', details: '', hint: '' });
  }
  const range = items.length ? `0-${items.length - 1}/${items.length}` : `*/0`;
  return json(route, 200, items, { 'content-range': range });
}

function eqParam(url: URL, column: string): string | null {
  const value = url.searchParams.get(column);
  return value?.startsWith('eq.') ? value.slice(3) : null;
}

export async function mockSupabase(page: Page): Promise<MockState> {
  const state: MockState = { favorites: [] };

  await page.route(`${SUPABASE_URL}/**`, async (route, request) => {
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS });
    }

    // ---- Auth ----
    if (url.pathname === '/auth/v1/token') {
      const body = request.postDataJSON() as { email?: string; password?: string };
      if (body.email === TEST_USER.email && body.password === TEST_USER.password) {
        return json(route, 200, session());
      }
      return json(route, 400, {
        code: 'invalid_credentials',
        error_code: 'invalid_credentials',
        msg: 'Invalid login credentials',
        message: 'Invalid login credentials',
      });
    }
    if (url.pathname === '/auth/v1/logout') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS });
    }
    if (url.pathname === '/auth/v1/user') {
      return json(route, 200, session().user);
    }

    // ---- PostgREST ----
    const table = url.pathname.replace('/rest/v1/', '');
    switch (table) {
      case 'profiles':
        return rows(route, request, [
          {
            id: TEST_USER.id,
            username: 'ana.prueba',
            full_name: TEST_USER.fullName,
            avatar_url: null,
            bio: null,
            role: 'user',
            created_at: now,
            updated_at: now,
          },
        ]);
      case 'scripts': {
        const id = eqParam(url, 'id');
        const category = eqParam(url, 'category');
        let items = SCRIPTS.filter(
          (script) => (!id || script.id === id) && (!category || script.category === category),
        );
        if (!id && !url.searchParams.get('select')?.includes('content')) {
          items = items.map(
            ({ content: _content, ...summary }) => summary as (typeof SCRIPTS)[number],
          );
        }
        return rows(route, request, items);
      }
      case 'user_favorites': {
        if (method === 'POST') {
          const body = request.postDataJSON() as { script_id?: string };
          if (body.script_id) {
            state.favorites.push({
              id: crypto.randomUUID(),
              script_id: body.script_id,
              created_at: new Date().toISOString(),
            });
          }
          return route.fulfill({ status: 201, headers: CORS_HEADERS });
        }
        if (method === 'DELETE') {
          const scriptId = eqParam(url, 'script_id');
          state.favorites = state.favorites.filter((favorite) => favorite.script_id !== scriptId);
          return route.fulfill({ status: 204, headers: CORS_HEADERS });
        }
        return rows(
          route,
          request,
          state.favorites.map((favorite) => {
            const script = SCRIPTS.find((item) => item.id === favorite.script_id);
            return {
              id: favorite.id,
              created_at: favorite.created_at,
              resource_type: 'script',
              script_id: favorite.script_id,
              lesson_id: null,
              note_id: null,
              manual_id: null,
              script: script
                ? {
                    id: script.id,
                    title: script.title,
                    description: script.description,
                    visibility: script.visibility,
                    updated_at: script.updated_at,
                  }
                : null,
              lesson: null,
              note: null,
              manual: null,
            };
          }),
        );
      }
      case 'rpc/search_resources': {
        const { p_query } = request.postDataJSON() as { p_query: string };
        const term = p_query.toLowerCase();
        return json(
          route,
          200,
          SCRIPTS.filter((script) =>
            `${script.title} ${script.tags.join(' ')}`.toLowerCase().includes(term),
          ).map((script) => ({
            resource_type: 'script',
            id: script.id,
            title: script.title,
            description: script.description,
            tags: script.tags,
            visibility: script.visibility,
            owner_id: script.owner_id,
            updated_at: script.updated_at,
            rank: 0.9,
          })),
        );
      }
      case 'lessons_learned':
      case 'notes':
      case 'manuals':
        return rows(route, request, []);
    }

    return json(route, 404, { message: `Ruta no simulada: ${method} ${url.pathname}` });
  });

  return state;
}
