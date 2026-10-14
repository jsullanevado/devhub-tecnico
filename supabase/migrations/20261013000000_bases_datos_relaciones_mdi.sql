-- =============================================================================
-- DevHub Técnico · Bases de datos, relaciones, carga masiva y Generar MDI
-- -----------------------------------------------------------------------------
-- Requiere: 20261008000000 … 20261012000000.
--
-- Trae a la web lo que la versión de escritorio añadió sobre el esquema:
--   1. Servicios: tipo explícito (servicio REST/SOAP o DataPower) y, en cada
--      operación, los servicios a los que llama (targets) y los objetos de BD
--      que usa (db_refs). Un DataPower enruta cada operación a un solo servicio
--      y no ejecuta SP.
--   2. Tabla databases: conexiones (cadena, host, servicio, usuario y
--      contraseña) con sus objetos (tablas, packages con sus SP, vistas…).
--      Mismo modelo de permisos que el resto de recursos (incluido superadmin).
--      Credenciales: igual que en services, en texto plano y visibles para
--      quien pueda ver la fila (privada = solo el propietario).
--   3. Favoritos, búsqueda global y panel con el nuevo tipo 'database'.
--   4. RPC de relaciones (catálogos, enlaces, uso de objetos y grafo completo)
--      para Reportes, árboles de dependencias y Flujos BPMN.
--   5. RPC transaccional de la carga masiva desde Excel.
--   6. Generar MDI: configuración por aplicativo, plantilla Word propia
--      (en el bucket devhub-documents) e historial, por usuario.
--
-- Idempotente. Se ejecuta en una única transacción.
-- =============================================================================

begin;

-- =============================================================================
-- 1. VALIDACIÓN (operaciones con destinos y objetos de BD; objetos de conexión)
-- =============================================================================

-- El valor si es un array jsonb; si no (ausente, null u otro tipo), un array vacío.
create or replace function private.json_array(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end;
$$;

-- Texto jsonb con formato de UUID.
create or replace function private.json_uuid_ok(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_value) = 'string'
     and (p_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- Servicios a los que llama una operación: [{ service_id, operation? }], máx. 20.
create or replace function private.service_targets_ok(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
      or jsonb_typeof(p_value) = 'null'
      or (
        jsonb_typeof(p_value) = 'array'
        and jsonb_array_length(p_value) <= 20
        and not exists (
          select 1 from jsonb_array_elements(p_value) as e(item)
          where jsonb_typeof(e.item) <> 'object'
             or not private.json_uuid_ok(e.item -> 'service_id')
             or not private.json_text_ok(e.item -> 'operation', 120)
        )
      );
$$;

-- Objetos de BD que usa una operación: [{ database_id, object, member? }], máx. 20.
create or replace function private.service_db_refs_ok(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
      or jsonb_typeof(p_value) = 'null'
      or (
        jsonb_typeof(p_value) = 'array'
        and jsonb_array_length(p_value) <= 20
        and not exists (
          select 1 from jsonb_array_elements(p_value) as e(item)
          where jsonb_typeof(e.item) <> 'object'
             or not private.json_uuid_ok(e.item -> 'database_id')
             or jsonb_typeof(e.item -> 'object') is distinct from 'string'
             or char_length(btrim(e.item ->> 'object')) < 1
             or char_length(e.item ->> 'object') > 257
             or not private.json_text_ok(e.item -> 'member', 128)
        )
      );
$$;

-- Operaciones de un servicio: máx. 50 y 2 MB en total (se añaden targets y db_refs).
create or replace function private.service_operations_valid(p_operations jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_operations is not null
     and jsonb_typeof(p_operations) = 'array'
     and jsonb_array_length(p_operations) <= 50
     and octet_length(p_operations::text) <= 2000000
     and not exists (
       select 1 from jsonb_array_elements(p_operations) as e(op)
       where jsonb_typeof(e.op) <> 'object'
          or jsonb_typeof(e.op -> 'name') is distinct from 'string'
          or char_length(btrim(e.op ->> 'name')) not between 1 and 120
          or coalesce(e.op ->> 'method', 'POST')
               not in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')
          or not private.json_text_ok(e.op -> 'path', 1000)
          or not private.json_text_ok(e.op -> 'soap_action', 500)
          or not private.json_text_ok(e.op -> 'media_type', 100)
          or not private.json_text_ok(e.op -> 'request_body', 200000)
          or not private.json_text_ok(e.op -> 'response_body', 200000)
          or not private.json_text_ok(e.op -> 'notes', 5000)
          or not private.json_pairs_ok(e.op -> 'headers')
          or not private.json_pairs_ok(e.op -> 'query_params')
          or not private.service_targets_ok(e.op -> 'targets')
          or not private.service_db_refs_ok(e.op -> 'db_refs')
          -- CASE garantiza que la conversión a número solo se evalúa si es un número.
          or not case coalesce(jsonb_typeof(e.op -> 'response_status'), 'null')
                   when 'null'   then true
                   when 'number' then (e.op ->> 'response_status')::numeric between 100 and 599
                   else false
                 end
     );
$$;

-- DataPower: cada operación enruta a un solo servicio y no usa objetos de BD.
create or replace function private.datapower_operations_ok(p_operations jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from jsonb_array_elements(private.json_array(p_operations)) as e(op)
    where jsonb_array_length(private.json_array(e.op -> 'targets')) > 1
       or jsonb_array_length(private.json_array(e.op -> 'db_refs')) > 0
  );
$$;

-- Objetos de una conexión: máx. 500 y 5 MB; tipo, esquema, nombre, descripción,
-- código (DDL, spec y body) y miembros (SP y funciones de un package, máx. 500).
create or replace function private.database_objects_valid(p_objects jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_objects is not null
     and jsonb_typeof(p_objects) = 'array'
     and jsonb_array_length(p_objects) <= 500
     and octet_length(p_objects::text) <= 5000000
     and not exists (
       select 1 from jsonb_array_elements(p_objects) as e(obj)
       where jsonb_typeof(e.obj) <> 'object'
          or coalesce(e.obj ->> 'type', '') not in ('table', 'package', 'procedure', 'function',
                                                    'view', 'sequence', 'trigger', 'type', 'other')
          or jsonb_typeof(e.obj -> 'name') is distinct from 'string'
          or char_length(btrim(e.obj ->> 'name')) not between 1 and 128
          or char_length(e.obj ->> 'name') > 128
          or not private.json_text_ok(e.obj -> 'schema', 128)
          or not private.json_text_ok(e.obj -> 'description', 5000)
          or not private.json_text_ok(e.obj -> 'code', 1000000)
          or (e.obj ? 'members' and jsonb_typeof(e.obj -> 'members') not in ('array', 'null'))
          or jsonb_array_length(private.json_array(e.obj -> 'members')) > 500
          or exists (
               select 1 from jsonb_array_elements(private.json_array(e.obj -> 'members')) as m(member)
               where jsonb_typeof(m.member) <> 'string'
                  or char_length(btrim(m.member #>> '{}')) < 1
                  or char_length(m.member #>> '{}') > 128
             )
     );
$$;

-- =============================================================================
-- 2. SERVICIOS: tipo de componente (servicio o DataPower)
-- =============================================================================
alter table public.services add column if not exists kind text not null default 'service';

-- Los servicios con dominio DataPower registrados antes de esta migración son DataPower.
update public.services
   set kind = 'datapower'
 where kind = 'service'
   and datapower_domain is not null
   and btrim(datapower_domain) <> '';

alter table public.services drop constraint if exists services_kind_valid;
alter table public.services
  add constraint services_kind_valid check (kind in ('service', 'datapower'));

alter table public.services drop constraint if exists services_datapower_routes;
alter table public.services
  add constraint services_datapower_routes
  check (kind <> 'datapower' or private.datapower_operations_ok(operations));

create index if not exists services_kind_idx on public.services (kind);

-- id: la carga masiva crea servicios con un id generado en el cliente para poder
-- enlazar sus operaciones en la misma transacción (bulk_import_apply).
grant insert (id, kind), update (kind) on public.services to authenticated;

-- =============================================================================
-- 3. TABLA databases (conexiones y sus objetos)
-- =============================================================================
create table if not exists public.databases (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title             text not null,
  description       text,
  engine            text not null default 'oracle',
  environment       text not null default 'dev',
  host              text,
  port              integer,
  service_name      text,
  connection_string text,
  username          text,
  password          text,
  notes             text,
  objects           jsonb not null default '[]'::jsonb,
  tags              text[] not null default '{}',
  visibility        text not null default 'private',
  search_vector     tsvector,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint databases_title_length        check (char_length(btrim(title)) between 3 and 200),
  constraint databases_description_length  check (description is null or char_length(description) <= 2000),
  constraint databases_engine_valid        check (engine in ('oracle', 'sqlserver', 'postgresql', 'mysql', 'other')),
  constraint databases_environment_valid   check (environment in ('dev', 'qa', 'prod', 'other')),
  constraint databases_host_length         check (host is null or char_length(host) between 1 and 255),
  constraint databases_port_range          check (port is null or port between 1 and 65535),
  constraint databases_service_name_length check (service_name is null or char_length(service_name) between 1 and 128),
  constraint databases_connection_length   check (connection_string is null or char_length(connection_string) <= 10000),
  constraint databases_username_length     check (username is null or char_length(username) <= 200),
  constraint databases_password_length     check (password is null or char_length(password) <= 4000),
  constraint databases_notes_length        check (notes is null or char_length(notes) <= 20000),
  -- Hace falta al menos una forma de conectarse.
  constraint databases_host_or_connection  check (host is not null or connection_string is not null),
  constraint databases_objects_valid       check (private.database_objects_valid(objects)),
  constraint databases_tags_valid          check (private.tags_are_valid(tags)),
  constraint databases_visibility_valid    check (visibility in ('private', 'public'))
);
comment on table public.databases is
  'Conexiones a bases de datos con sus objetos. Las credenciales son visibles para quien pueda ver la fila.';

create index if not exists databases_owner_updated_idx  on public.databases (owner_id, updated_at desc);
create index if not exists databases_public_updated_idx on public.databases (updated_at desc) where visibility = 'public';
create index if not exists databases_engine_idx         on public.databases (engine);
create index if not exists databases_environment_idx    on public.databases (environment);
create index if not exists databases_tags_idx           on public.databases using gin (tags);
create index if not exists databases_search_idx         on public.databases using gin (search_vector);

-- =============================================================================
-- 4. BÚSQUEDA: servicios (tipo, objetos de BD) y conexiones
-- =============================================================================
create or replace function private.resource_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_body text;
begin
  new.tags := private.normalize_tags(new.tags);

  if tg_table_name = 'scripts' then
    v_body := concat_ws(' ', new.language, new.content);
  elsif tg_table_name = 'lessons_learned' then
    v_body := concat_ws(' ', new.technology, new.problem, new.root_cause, new.solution, new.conclusion);
  elsif tg_table_name = 'notes' then
    v_body := new.content;
  elsif tg_table_name = 'manuals' then
    v_body := concat_ws(' ', new.version, new.file_name);
  elsif tg_table_name = 'services' then
    -- Se indexan los identificadores (URL, rutas, SOAPAction, DataPower, objetos de BD),
    -- no los ejemplos de request/response ni las credenciales.
    v_body := concat_ws(' ',
      case when new.kind = 'datapower' then 'DataPower' end,
      new.system, new.protocol, new.base_url, new.wsdl_url,
      new.datapower_domain, new.datapower_object, new.notes,
      (select string_agg(concat_ws(' ', o.op ->> 'name', o.op ->> 'method',
                                   o.op ->> 'path', o.op ->> 'soap_action',
                                   (select string_agg(concat_ws(' ', r.ref ->> 'object', r.ref ->> 'member'), ' ')
                                      from jsonb_array_elements(private.json_array(o.op -> 'db_refs')) as r(ref))),
                         ' ')
         from jsonb_array_elements(new.operations) as o(op)));
  elsif tg_table_name = 'databases' then
    -- Alias, host, servicio, usuario, cadena y objetos; nunca la contraseña.
    v_body := concat_ws(' ',
      new.engine, new.environment, new.host, new.service_name, new.username,
      new.connection_string, new.notes,
      (select string_agg(concat_ws(' ', o.obj ->> 'schema', o.obj ->> 'name', o.obj ->> 'description',
                                   (select string_agg(m.member #>> '{}', ' ')
                                      from jsonb_array_elements(private.json_array(o.obj -> 'members')) as m(member))),
                         ' ')
         from jsonb_array_elements(new.objects) as o(obj)));
  end if;

  new.search_vector := private.build_search_vector(new.title, new.description, new.tags, v_body);

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create or replace trigger databases_before_write
  before insert or update on public.databases
  for each row execute function private.resource_before_write();

-- =============================================================================
-- 5. RLS, PRIVILEGIOS Y POLÍTICAS DE databases (mismo modelo que el resto, con superadmin)
-- =============================================================================
alter table public.databases enable row level security;

revoke all on table public.databases from anon, authenticated;
grant select, delete on public.databases to authenticated;
-- id: ver la nota de services (carga masiva).
grant insert (id, title, description, engine, environment, host, port, service_name, connection_string,
              username, password, notes, objects, tags, visibility),
      update (title, description, engine, environment, host, port, service_name, connection_string,
              username, password, notes, objects, tags, visibility)
  on public.databases to authenticated;

drop policy if exists databases_select_own_or_public on public.databases;
create policy databases_select_own_or_public on public.databases
  for select to authenticated
  using (visibility = 'public'
         or owner_id = (select auth.uid())
         or (select private.is_superadmin()));

drop policy if exists databases_insert_own on public.databases;
create policy databases_insert_own on public.databases
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists databases_update_own on public.databases;
create policy databases_update_own on public.databases
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_superadmin()))
  with check (owner_id = (select auth.uid()) or (select private.is_superadmin()));

drop policy if exists databases_delete_own_or_admin on public.databases;
create policy databases_delete_own_or_admin on public.databases
  for delete to authenticated
  using (owner_id = (select auth.uid())
         or (visibility = 'public' and (select private.is_admin()))
         or (select private.is_superadmin()));

-- =============================================================================
-- 6. FAVORITOS: nuevo tipo 'database'
-- =============================================================================
alter table public.user_favorites
  add column if not exists database_id uuid references public.databases (id) on delete cascade;

alter table public.user_favorites drop constraint if exists user_favorites_exactly_one_resource;
alter table public.user_favorites
  add constraint user_favorites_exactly_one_resource
  check (num_nonnulls(script_id, lesson_id, note_id, manual_id, service_id, database_id) = 1);

-- La columna generada no se puede modificar: se vuelve a crear (no guarda datos propios).
alter table public.user_favorites drop column if exists resource_type;
alter table public.user_favorites add column resource_type text generated always as (
  case
    when script_id   is not null then 'script'
    when lesson_id   is not null then 'lesson'
    when note_id     is not null then 'note'
    when manual_id   is not null then 'manual'
    when service_id  is not null then 'service'
    when database_id is not null then 'database'
  end
) stored;

create unique index if not exists user_favorites_database_key
  on public.user_favorites (database_id, user_id) where database_id is not null;

grant insert (database_id) on public.user_favorites to authenticated;

drop policy if exists user_favorites_insert_own_visible on public.user_favorites;
create policy user_favorites_insert_own_visible on public.user_favorites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
         (user_favorites.script_id is not null
          and exists (select 1 from public.scripts s where s.id = user_favorites.script_id))
      or (user_favorites.lesson_id is not null
          and exists (select 1 from public.lessons_learned l where l.id = user_favorites.lesson_id))
      or (user_favorites.note_id is not null
          and exists (select 1 from public.notes n where n.id = user_favorites.note_id))
      or (user_favorites.manual_id is not null
          and exists (select 1 from public.manuals m where m.id = user_favorites.manual_id))
      or (user_favorites.service_id is not null
          and exists (select 1 from public.services v where v.id = user_favorites.service_id))
      or (user_favorites.database_id is not null
          and exists (select 1 from public.databases d where d.id = user_favorites.database_id))
    )
  );

-- =============================================================================
-- 7. BÚSQUEDA GLOBAL Y PANEL: incluir conexiones
-- =============================================================================
create or replace function public.search_resources(
  p_query  text,
  p_types  text[]  default null,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  resource_type text,
  id            uuid,
  title         text,
  description   text,
  tags          text[],
  visibility    text,
  owner_id      uuid,
  updated_at    timestamptz,
  rank          real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select websearch_to_tsquery('public.spanish_unaccent'::regconfig, coalesce(p_query, '')) as tsq
  )
  select r.resource_type, r.id, r.title, r.description, r.tags, r.visibility, r.owner_id, r.updated_at, r.rank
  from (
    select 'script'::text as resource_type, s.id, s.title, s.description, s.tags, s.visibility,
           s.owner_id, s.updated_at, ts_rank(s.search_vector, q.tsq) as rank
    from public.scripts s, q
    where (p_types is null or 'script' = any (p_types)) and s.search_vector @@ q.tsq
    union all
    select 'lesson', l.id, l.title, l.description, l.tags, l.visibility,
           l.owner_id, l.updated_at, ts_rank(l.search_vector, q.tsq)
    from public.lessons_learned l, q
    where (p_types is null or 'lesson' = any (p_types)) and l.search_vector @@ q.tsq
    union all
    select 'note', n.id, n.title, n.description, n.tags, n.visibility,
           n.owner_id, n.updated_at, ts_rank(n.search_vector, q.tsq)
    from public.notes n, q
    where (p_types is null or 'note' = any (p_types)) and n.search_vector @@ q.tsq
    union all
    select 'manual', m.id, m.title, m.description, m.tags, m.visibility,
           m.owner_id, m.updated_at, ts_rank(m.search_vector, q.tsq)
    from public.manuals m, q
    where (p_types is null or 'manual' = any (p_types)) and m.search_vector @@ q.tsq
    union all
    select 'service', v.id, v.title, v.description, v.tags, v.visibility,
           v.owner_id, v.updated_at, ts_rank(v.search_vector, q.tsq)
    from public.services v, q
    where (p_types is null or 'service' = any (p_types)) and v.search_vector @@ q.tsq
    union all
    select 'database', d.id, d.title, d.description, d.tags, d.visibility,
           d.owner_id, d.updated_at, ts_rank(d.search_vector, q.tsq)
    from public.databases d, q
    where (p_types is null or 'database' = any (p_types)) and d.search_vector @@ q.tsq
  ) as r
  order by r.rank desc, r.updated_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_resources(text, text[], integer, integer) from public, anon;
grant execute on function public.search_resources(text, text[], integer, integer) to authenticated;

create or replace function public.dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with resources as (
    select 'script'::text as resource_type, s.id, s.owner_id, s.title, s.visibility, s.updated_at, s.tags
    from public.scripts s
    union all
    select 'lesson', l.id, l.owner_id, l.title, l.visibility, l.updated_at, l.tags
    from public.lessons_learned l
    union all
    select 'note', n.id, n.owner_id, n.title, n.visibility, n.updated_at, n.tags
    from public.notes n
    union all
    select 'manual', m.id, m.owner_id, m.title, m.visibility, m.updated_at, m.tags
    from public.manuals m
    union all
    select 'service', v.id, v.owner_id, v.title, v.visibility, v.updated_at, v.tags
    from public.services v
    union all
    select 'database', d.id, d.owner_id, d.title, d.visibility, d.updated_at, d.tags
    from public.databases d
  ),
  with_author as (
    select r.resource_type, r.id, r.owner_id, r.title, r.visibility, r.updated_at,
           coalesce(p.full_name, p.username) as author
    from resources r
    left join public.profiles p on p.id = r.owner_id
  )
  select jsonb_build_object(
    'counts', (
      select coalesce(jsonb_object_agg(c.resource_type,
                        jsonb_build_object('total', c.total, 'mine', c.mine)), '{}'::jsonb)
      from (
        select r.resource_type,
               count(*) as total,
               count(*) filter (where r.owner_id = (select auth.uid())) as mine
        from resources r
        group by r.resource_type
      ) as c
    ),
    'recent', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
      from (select * from with_author order by updated_at desc limit 8) as x
    ),
    'mine_recent', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
      from (
        select * from with_author
        where owner_id = (select auth.uid())
        order by updated_at desc
        limit 5
      ) as x
    ),
    'lessons', (
      select jsonb_build_object(
        'open',          count(*) filter (where l.status = 'open'),
        'open_critical', count(*) filter (where l.status = 'open' and l.severity = 'critical'),
        'open_high',     count(*) filter (where l.status = 'open' and l.severity = 'high')
      )
      from public.lessons_learned l
    ),
    'top_manuals', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.download_count desc, x.updated_at desc), '[]'::jsonb)
      from (
        select m.id, m.title, m.download_count, m.updated_at
        from public.manuals m
        where m.download_count > 0
        order by m.download_count desc, m.updated_at desc
        limit 5
      ) as x
    ),
    'top_tags', (
      select coalesce(jsonb_agg(jsonb_build_object('tag', t.tag, 'count', t.total)
                                order by t.total desc, t.tag), '[]'::jsonb)
      from (
        select u.tag, count(*) as total
        from resources r, unnest(r.tags) as u(tag)
        group by u.tag
        order by count(*) desc, u.tag
        limit 15
      ) as t
    ),
    'storage', jsonb_build_object('used_bytes', private.storage_used_bytes())
  );
$$;

revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated;

-- =============================================================================
-- 8. RPC DE RELACIONES (SECURITY INVOKER: solo lo que el usuario puede ver)
-- =============================================================================

-- Servicios para elegir el destino de una operación: id, título, tipo y nombres de operación.
create or replace function public.services_catalog()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'title', s.title, 'kind', s.kind, 'protocol', s.protocol,
           'system', s.system, 'base_url', s.base_url, 'datapower_domain', s.datapower_domain,
           'operations', (select coalesce(jsonb_agg(o.op -> 'name' order by o.n), '[]'::jsonb)
                            from jsonb_array_elements(s.operations) with ordinality as o(op, n)
                           where jsonb_typeof(o.op -> 'name') = 'string'))
         order by lower(s.title), s.id), '[]'::jsonb)
  from public.services s;
$$;

-- Enlaces de un servicio:
--   targets   : servicios a los que llaman sus operaciones (null si no existe o no es visible).
--   exposedBy : operaciones de otros servicios (p. ej. un DataPower) que llaman a este.
--   databases : conexiones de los objetos de BD que usan sus operaciones (null si no existe).
create or replace function public.service_links(p_service_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_operations jsonb;
begin
  select s.operations into v_operations from public.services s where s.id = p_service_id;
  if not found then
    raise exception 'Servicio no encontrado' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'targets', (
      select coalesce(jsonb_object_agg(ids.id, (
               select jsonb_build_object('id', t.id, 'title', t.title, 'protocol', t.protocol,
                                         'base_url', t.base_url)
               from public.services t where t.id::text = ids.id)), '{}'::jsonb)
      from (
        select distinct tg.item ->> 'service_id' as id
        from jsonb_array_elements(v_operations) as o(op),
             jsonb_array_elements(private.json_array(o.op -> 'targets')) as tg(item)
        where private.json_uuid_ok(tg.item -> 'service_id')
      ) as ids
    ),
    'exposedBy', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', x.id, 'title', x.title, 'kind', x.kind, 'protocol', x.protocol,
               'datapower_domain', x.datapower_domain, 'operation', x.operation,
               'target_operation', x.target_operation)
             order by lower(x.title), x.operation), '[]'::jsonb)
      from (
        select s.id, s.title, s.kind, s.protocol, s.datapower_domain,
               o.op ->> 'name' as operation, tg.item ->> 'operation' as target_operation
        from public.services s,
             jsonb_array_elements(s.operations) as o(op),
             jsonb_array_elements(private.json_array(o.op -> 'targets')) as tg(item)
        where s.id <> p_service_id
          and tg.item ->> 'service_id' = p_service_id::text
      ) as x
    ),
    'databases', (
      select coalesce(jsonb_object_agg(ids.id, (
               select jsonb_build_object('id', d.id, 'title', d.title, 'engine', d.engine,
                                         'environment', d.environment)
               from public.databases d where d.id::text = ids.id)), '{}'::jsonb)
      from (
        select distinct r.ref ->> 'database_id' as id
        from jsonb_array_elements(v_operations) as o(op),
             jsonb_array_elements(private.json_array(o.op -> 'db_refs')) as r(ref)
        where private.json_uuid_ok(r.ref -> 'database_id')
      ) as ids
    )
  );
end;
$$;

-- Conexiones con sus objetos (sin código) para elegirlos desde una operación de servicio.
create or replace function public.databases_catalog()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'title', d.title, 'engine', d.engine, 'environment', d.environment,
           'objects', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'type', o.obj -> 'type', 'schema', o.obj -> 'schema',
                                 'name', o.obj -> 'name',
                                 'members', private.json_array(o.obj -> 'members'))
                               order by o.n), '[]'::jsonb)
                         from jsonb_array_elements(d.objects) with ordinality as o(obj, n)))
         order by lower(d.title), d.id), '[]'::jsonb)
  from public.databases d;
$$;

-- Operaciones de servicios que usan objetos de una conexión.
create or replace function public.database_used_by(p_database_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'title', x.title, 'kind', x.kind, 'protocol', x.protocol,
           'datapower_domain', x.datapower_domain, 'operation', x.operation,
           'object', x.object, 'member', x.member)
         order by lower(x.object), lower(x.title), x.operation), '[]'::jsonb)
  from (
    select s.id, s.title, s.kind, s.protocol, s.datapower_domain,
           o.op ->> 'name' as operation, r.ref ->> 'object' as object, r.ref ->> 'member' as member
    from public.services s,
         jsonb_array_elements(s.operations) as o(op),
         jsonb_array_elements(private.json_array(o.op -> 'db_refs')) as r(ref)
    where r.ref ->> 'database_id' = p_database_id::text
  ) as x;
$$;

-- Grafo completo para reportes, árboles y flujos: servicios con sus operaciones (solo
-- nombre, método, ruta, destinos y objetos de BD) y conexiones con sus objetos (sin
-- código ni credenciales).
create or replace function public.relations_graph()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'kind', s.kind, 'protocol', s.protocol,
               'system', s.system, 'base_url', s.base_url, 'datapower_domain', s.datapower_domain,
               'operations', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'name', o.op -> 'name',
                                     'method', coalesce(o.op -> 'method', '"POST"'::jsonb),
                                     'path', o.op -> 'path',
                                     'soap_action', o.op -> 'soap_action',
                                     'targets', private.json_array(o.op -> 'targets'),
                                     'db_refs', private.json_array(o.op -> 'db_refs'))
                                   order by o.n), '[]'::jsonb)
                              from jsonb_array_elements(s.operations) with ordinality as o(op, n)))
             order by lower(s.title), s.id), '[]'::jsonb)
      from public.services s
    ),
    'databases', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'title', d.title, 'engine', d.engine, 'environment', d.environment,
               'host', d.host, 'service_name', d.service_name,
               'objects', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'type', o.obj -> 'type', 'schema', o.obj -> 'schema',
                                     'name', o.obj -> 'name', 'description', o.obj -> 'description',
                                     'members', private.json_array(o.obj -> 'members'))
                                   order by o.n), '[]'::jsonb)
                             from jsonb_array_elements(d.objects) with ordinality as o(obj, n)))
             order by lower(d.title), d.id), '[]'::jsonb)
      from public.databases d
    )
  );
$$;

-- =============================================================================
-- 9. CARGA MASIVA: aplicar el plan del Excel en UNA transacción
-- -----------------------------------------------------------------------------
-- El navegador lee el Excel, valida y resuelve las referencias por título (los
-- ids de lo nuevo se generan en el cliente). Aquí solo se escribe, con el RLS del
-- usuario: si una fila no se puede crear o modificar, se revierte todo.
--   p_databases / p_services: [{ id, is_new, changes }]; changes solo trae las
--   columnas que cambian (en una actualización no se tocan las demás).
-- =============================================================================
create or replace function public.bulk_import_apply(p_databases jsonb, p_services jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_item    jsonb;
  v_changes jsonb;
  v_id      uuid;
  v_title   text;
  v_created integer := 0;
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Autenticación requerida' using errcode = '28000';
  end if;
  if jsonb_typeof(p_databases) <> 'array' or jsonb_typeof(p_services) <> 'array'
     or jsonb_array_length(p_databases) + jsonb_array_length(p_services) > 5000 then
    raise exception 'La carga masiva no es válida' using errcode = '22023';
  end if;

  -- 1 · Conexiones (con sus objetos).
  for v_item in select value from jsonb_array_elements(p_databases) loop
    v_id := (v_item ->> 'id')::uuid;
    v_changes := coalesce(v_item -> 'changes', '{}'::jsonb);
    if coalesce((v_item ->> 'is_new')::boolean, false) then
      insert into public.databases (id, title, description, engine, environment, host, port, service_name,
                                    connection_string, username, password, notes, objects, tags, visibility)
      values (
        v_id,
        v_changes ->> 'title',
        v_changes ->> 'description',
        coalesce(v_changes ->> 'engine', 'oracle'),
        coalesce(v_changes ->> 'environment', 'dev'),
        v_changes ->> 'host',
        (v_changes ->> 'port')::integer,
        v_changes ->> 'service_name',
        v_changes ->> 'connection_string',
        v_changes ->> 'username',
        v_changes ->> 'password',
        v_changes ->> 'notes',
        coalesce(v_changes -> 'objects', '[]'::jsonb),
        coalesce(array(select jsonb_array_elements_text(private.json_array(v_changes -> 'tags'))), '{}'),
        coalesce(v_changes ->> 'visibility', 'private')
      );
      v_created := v_created + 1;
    elsif v_changes <> '{}'::jsonb then
      update public.databases d set
        title             = case when v_changes ? 'title' then v_changes ->> 'title' else d.title end,
        description       = case when v_changes ? 'description' then v_changes ->> 'description' else d.description end,
        engine            = case when v_changes ? 'engine' then v_changes ->> 'engine' else d.engine end,
        environment       = case when v_changes ? 'environment' then v_changes ->> 'environment' else d.environment end,
        host              = case when v_changes ? 'host' then v_changes ->> 'host' else d.host end,
        port              = case when v_changes ? 'port' then (v_changes ->> 'port')::integer else d.port end,
        service_name      = case when v_changes ? 'service_name' then v_changes ->> 'service_name' else d.service_name end,
        connection_string = case when v_changes ? 'connection_string' then v_changes ->> 'connection_string' else d.connection_string end,
        username          = case when v_changes ? 'username' then v_changes ->> 'username' else d.username end,
        password          = case when v_changes ? 'password' then v_changes ->> 'password' else d.password end,
        notes             = case when v_changes ? 'notes' then v_changes ->> 'notes' else d.notes end,
        objects           = case when v_changes ? 'objects' then v_changes -> 'objects' else d.objects end,
        tags              = case when v_changes ? 'tags'
                                 then coalesce(array(select jsonb_array_elements_text(private.json_array(v_changes -> 'tags'))), '{}')
                                 else d.tags end,
        visibility        = case when v_changes ? 'visibility' then v_changes ->> 'visibility' else d.visibility end
      where d.id = v_id
      returning d.title into v_title;
      if not found then
        raise exception 'No tienes permisos para modificar la conexión % (es de otro usuario).',
          coalesce(v_changes ->> 'title', v_id::text) using errcode = '42501';
      end if;
      v_updated := v_updated + 1;
    end if;
  end loop;

  -- 2 · Servicios y DataPower (operaciones con las referencias ya resueltas).
  for v_item in select value from jsonb_array_elements(p_services) loop
    v_id := (v_item ->> 'id')::uuid;
    v_changes := coalesce(v_item -> 'changes', '{}'::jsonb);
    if coalesce((v_item ->> 'is_new')::boolean, false) then
      insert into public.services (id, title, description, kind, system, protocol, base_url, wsdl_url,
                                   datapower_domain, datapower_object, auth_type, auth_username,
                                   auth_secret, auth_notes, notes, operations, tags, visibility)
      values (
        v_id,
        v_changes ->> 'title',
        v_changes ->> 'description',
        coalesce(v_changes ->> 'kind', 'service'),
        v_changes ->> 'system',
        coalesce(v_changes ->> 'protocol', 'rest'),
        v_changes ->> 'base_url',
        v_changes ->> 'wsdl_url',
        v_changes ->> 'datapower_domain',
        v_changes ->> 'datapower_object',
        coalesce(v_changes ->> 'auth_type', 'none'),
        v_changes ->> 'auth_username',
        v_changes ->> 'auth_secret',
        v_changes ->> 'auth_notes',
        v_changes ->> 'notes',
        coalesce(v_changes -> 'operations', '[]'::jsonb),
        coalesce(array(select jsonb_array_elements_text(private.json_array(v_changes -> 'tags'))), '{}'),
        coalesce(v_changes ->> 'visibility', 'private')
      );
      v_created := v_created + 1;
    elsif v_changes <> '{}'::jsonb then
      update public.services s set
        title            = case when v_changes ? 'title' then v_changes ->> 'title' else s.title end,
        description      = case when v_changes ? 'description' then v_changes ->> 'description' else s.description end,
        kind             = case when v_changes ? 'kind' then v_changes ->> 'kind' else s.kind end,
        system           = case when v_changes ? 'system' then v_changes ->> 'system' else s.system end,
        protocol         = case when v_changes ? 'protocol' then v_changes ->> 'protocol' else s.protocol end,
        base_url         = case when v_changes ? 'base_url' then v_changes ->> 'base_url' else s.base_url end,
        wsdl_url         = case when v_changes ? 'wsdl_url' then v_changes ->> 'wsdl_url' else s.wsdl_url end,
        datapower_domain = case when v_changes ? 'datapower_domain' then v_changes ->> 'datapower_domain' else s.datapower_domain end,
        datapower_object = case when v_changes ? 'datapower_object' then v_changes ->> 'datapower_object' else s.datapower_object end,
        auth_type        = case when v_changes ? 'auth_type' then v_changes ->> 'auth_type' else s.auth_type end,
        auth_username    = case when v_changes ? 'auth_username' then v_changes ->> 'auth_username' else s.auth_username end,
        auth_secret      = case when v_changes ? 'auth_secret' then v_changes ->> 'auth_secret' else s.auth_secret end,
        auth_notes       = case when v_changes ? 'auth_notes' then v_changes ->> 'auth_notes' else s.auth_notes end,
        notes            = case when v_changes ? 'notes' then v_changes ->> 'notes' else s.notes end,
        operations       = case when v_changes ? 'operations' then v_changes -> 'operations' else s.operations end,
        tags             = case when v_changes ? 'tags'
                                then coalesce(array(select jsonb_array_elements_text(private.json_array(v_changes -> 'tags'))), '{}')
                                else s.tags end,
        visibility       = case when v_changes ? 'visibility' then v_changes ->> 'visibility' else s.visibility end
      where s.id = v_id
      returning s.title into v_title;
      if not found then
        raise exception 'No tienes permisos para modificar el servicio % (es de otro usuario).',
          coalesce(v_changes ->> 'title', v_id::text) using errcode = '42501';
      end if;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

-- =============================================================================
-- 10. GENERAR MDI: configuración, plantilla propia e historial (por usuario)
-- =============================================================================

-- 10.1 Configuración por aplicativo (rama destino, exclusiones, servidores, autor).
-- La carpeta del clon NO se guarda aquí: el navegador recuerda el permiso de la carpeta.
create table if not exists public.mdi_configs (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  app        text not null,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, app),
  constraint mdi_configs_app_format  check (app ~ '^[A-Z0-9_]{2,40}$'),
  constraint mdi_configs_config_valid check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 100000)
);

-- 10.2 Plantilla Word propia de un aplicativo (sustituye a la incluida en la app).
create table if not exists public.mdi_templates (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  app        text not null,
  file_path  text not null,
  file_name  text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, app),
  constraint mdi_templates_file_path_key    unique (file_path),
  constraint mdi_templates_app_format       check (app ~ '^[A-Z0-9_]{2,40}$'),
  constraint mdi_templates_file_path_format check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.docx$'),
  constraint mdi_templates_file_path_owner  check (split_part(file_path, '/', 1) = user_id::text),
  constraint mdi_templates_file_name_length check (char_length(file_name) between 1 and 255)
);

-- 10.3 Historial de MDI generados (datos completos para poder regenerarlos).
create table if not exists public.mdi_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  app           text not null,
  layer         text not null,
  source_branch text not null,
  target_branch text not null,
  proyecto      text not null,
  file_name     text not null,
  payload       jsonb not null,
  created_at    timestamptz not null default now(),
  constraint mdi_history_app_format     check (app ~ '^[A-Z0-9_]{2,40}$'),
  constraint mdi_history_layer_length   check (char_length(layer) between 1 and 20),
  constraint mdi_history_branch_length  check (char_length(source_branch) <= 250 and char_length(target_branch) <= 250),
  constraint mdi_history_proyecto_len   check (char_length(proyecto) <= 200),
  constraint mdi_history_file_name_len  check (char_length(file_name) between 1 and 255),
  constraint mdi_history_payload_valid  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 5000000)
);
create index if not exists mdi_history_user_created_idx on public.mdi_history (user_id, created_at desc);

create or replace trigger mdi_configs_set_updated_at
  before update on public.mdi_configs
  for each row execute function private.set_updated_at();

create or replace trigger mdi_templates_set_updated_at
  before update on public.mdi_templates
  for each row execute function private.set_updated_at();

alter table public.mdi_configs   enable row level security;
alter table public.mdi_templates enable row level security;
alter table public.mdi_history   enable row level security;

revoke all on table public.mdi_configs, public.mdi_templates, public.mdi_history from anon, authenticated;

grant select, delete on public.mdi_configs to authenticated;
grant insert (app, config), update (config) on public.mdi_configs to authenticated;

grant select, delete on public.mdi_templates to authenticated;
grant insert (app, file_path, file_name), update (file_path, file_name) on public.mdi_templates to authenticated;

grant select, delete on public.mdi_history to authenticated;
grant insert (app, layer, source_branch, target_branch, proyecto, file_name, payload)
  on public.mdi_history to authenticated;

-- Cada usuario ve y gestiona solo lo suyo.
drop policy if exists mdi_configs_own on public.mdi_configs;
create policy mdi_configs_own on public.mdi_configs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists mdi_templates_own on public.mdi_templates;
create policy mdi_templates_own on public.mdi_templates
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists mdi_history_own on public.mdi_history;
create policy mdi_history_own on public.mdi_history
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 10.4 Storage: la plantilla (.docx, ya permitido en el bucket) no se puede borrar
-- mientras siga vinculada (orden correcto: cambiar la fila y después borrar el archivo).
drop policy if exists devhub_documents_delete_own_unlinked on storage.objects;
create policy devhub_documents_delete_own_unlinked on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'devhub-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select private.is_superadmin()))
    and not exists (select 1 from public.manuals m where m.file_path = objects.name)
    and not exists (select 1 from public.services v where v.soapui_file_path = objects.name)
    and not exists (select 1 from public.mdi_templates t where t.file_path = objects.name)
  );

-- =============================================================================
-- 11. PERMISOS DE FUNCIONES
-- =============================================================================
revoke all on function
  private.json_array(jsonb),
  private.json_uuid_ok(jsonb),
  private.service_targets_ok(jsonb),
  private.service_db_refs_ok(jsonb),
  private.service_operations_valid(jsonb),
  private.datapower_operations_ok(jsonb),
  private.database_objects_valid(jsonb),
  private.resource_before_write()
from public, anon;
grant execute on function
  private.json_array(jsonb),
  private.json_uuid_ok(jsonb),
  private.service_targets_ok(jsonb),
  private.service_db_refs_ok(jsonb),
  private.service_operations_valid(jsonb),
  private.datapower_operations_ok(jsonb),
  private.database_objects_valid(jsonb),
  private.resource_before_write()
to authenticated;

revoke all on function
  public.services_catalog(),
  public.service_links(uuid),
  public.databases_catalog(),
  public.database_used_by(uuid),
  public.relations_graph(),
  public.bulk_import_apply(jsonb, jsonb)
from public, anon;
grant execute on function
  public.services_catalog(),
  public.service_links(uuid),
  public.databases_catalog(),
  public.database_used_by(uuid),
  public.relations_graph(),
  public.bulk_import_apply(jsonb, jsonb)
to authenticated;

commit;
