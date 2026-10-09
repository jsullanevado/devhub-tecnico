-- =============================================================================
-- DevHub Técnico · Módulo "Servicios" (catálogo de servicios REST/SOAP/DataPower)
-- -----------------------------------------------------------------------------
-- Requiere: 20261008000000 (esquema base) y 20261010000000 (dashboard_summary).
--
-- Una fila de public.services = un servicio (endpoint base, DataPower, WSDL,
-- credenciales, proyecto SoapUI adjunto) con sus operaciones en `operations`
-- (jsonb validado): nombre, método, recurso/SOAPAction, headers, query params,
-- request y response de ejemplo.
--
-- Credenciales: DECISIÓN DEL USUARIO → se comparten con quien pueda ver el
-- servicio (privado = solo el propietario; público = todo el equipo). Se
-- guardan en texto plano dentro de la base de datos (cifrada en disco por
-- Supabase), visibles para quien tenga acceso al panel de Supabase.
--
-- Integra el nuevo tipo en favoritos, en search_resources y en dashboard_summary.
-- Idempotente. Se ejecuta en una única transacción.
-- =============================================================================

begin;

-- =============================================================================
-- 1. VALIDACIÓN DE OPERACIONES
-- =============================================================================

-- Texto opcional en jsonb: ausente, null o cadena de como máximo p_max caracteres.
create or replace function private.json_text_ok(p_value jsonb, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
      or jsonb_typeof(p_value) = 'null'
      or (jsonb_typeof(p_value) = 'string' and char_length(p_value #>> '{}') <= p_max);
$$;

-- Lista de pares {name, value} (headers, query params): máx. 50.
create or replace function private.json_pairs_ok(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
      or jsonb_typeof(p_value) = 'null'
      or (
        jsonb_typeof(p_value) = 'array'
        and jsonb_array_length(p_value) <= 50
        and not exists (
          select 1 from jsonb_array_elements(p_value) as e(item)
          where jsonb_typeof(e.item) <> 'object'
             or jsonb_typeof(e.item -> 'name') is distinct from 'string'
             or char_length(btrim(e.item ->> 'name')) not between 1 and 200
             or not private.json_text_ok(e.item -> 'value', 4000)
        )
      );
$$;

-- Operaciones de un servicio: máx. 50 y 2 MB en total.
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
          -- CASE garantiza que la conversión a número solo se evalúa si es un número.
          or not case coalesce(jsonb_typeof(e.op -> 'response_status'), 'null')
                   when 'null'   then true
                   when 'number' then (e.op ->> 'response_status')::numeric between 100 and 599
                   else false
                 end
     );
$$;

-- =============================================================================
-- 2. TABLA services
-- =============================================================================
create table if not exists public.services (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title             text not null,
  description       text,
  system            text,
  protocol          text not null default 'rest',
  base_url          text not null,
  wsdl_url          text,
  datapower_domain  text,
  datapower_object  text,
  auth_type         text not null default 'none',
  auth_username     text,
  auth_secret       text,
  auth_notes        text,
  notes             text,
  operations        jsonb not null default '[]'::jsonb,
  soapui_file_path  text,
  soapui_file_name  text,
  soapui_file_size  bigint,
  tags              text[] not null default '{}',
  visibility        text not null default 'private',
  search_vector     tsvector,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint services_soapui_file_path_key   unique (soapui_file_path),
  constraint services_title_length           check (char_length(btrim(title)) between 3 and 200),
  constraint services_description_length    check (description is null or char_length(description) <= 2000),
  constraint services_system_length         check (system is null or char_length(system) between 1 and 60),
  constraint services_protocol_valid        check (protocol in ('rest', 'soap')),
  constraint services_base_url_format       check (base_url ~ '^https?://[^\s]+$' and char_length(base_url) <= 500),
  constraint services_wsdl_url_format       check (wsdl_url is null
                                                   or (wsdl_url ~ '^https?://[^\s]+$' and char_length(wsdl_url) <= 1000)),
  constraint services_dp_domain_length      check (datapower_domain is null or char_length(datapower_domain) between 1 and 100),
  constraint services_dp_object_length      check (datapower_object is null or char_length(datapower_object) between 1 and 150),
  constraint services_auth_type_valid       check (auth_type in ('none', 'basic', 'bearer', 'api_key', 'other')),
  constraint services_auth_username_length  check (auth_username is null or char_length(auth_username) <= 200),
  constraint services_auth_secret_length    check (auth_secret is null or char_length(auth_secret) <= 4000),
  constraint services_auth_notes_length     check (auth_notes is null or char_length(auth_notes) <= 2000),
  constraint services_notes_length          check (notes is null or char_length(notes) <= 20000),
  constraint services_operations_valid      check (private.service_operations_valid(operations)),
  -- Proyecto SoapUI: los tres campos van juntos.
  constraint services_soapui_all_or_none    check (num_nulls(soapui_file_path, soapui_file_name, soapui_file_size) in (0, 3)),
  constraint services_soapui_path_format    check (soapui_file_path is null
                                                   or soapui_file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.xml$'),
  constraint services_soapui_path_owner     check (soapui_file_path is null
                                                   or split_part(soapui_file_path, '/', 1) = owner_id::text),
  constraint services_soapui_name_length    check (soapui_file_name is null or char_length(soapui_file_name) between 1 and 255),
  constraint services_soapui_size_range     check (soapui_file_size is null or soapui_file_size between 1 and 52428800),
  constraint services_tags_valid            check (private.tags_are_valid(tags)),
  constraint services_visibility_valid      check (visibility in ('private', 'public'))
);
comment on table public.services is
  'Catálogo de servicios REST/SOAP. Las credenciales (auth_*) son visibles para quien pueda ver la fila.';

create index if not exists services_owner_updated_idx  on public.services (owner_id, updated_at desc);
create index if not exists services_public_updated_idx on public.services (updated_at desc) where visibility = 'public';
create index if not exists services_protocol_idx       on public.services (protocol);
create index if not exists services_system_idx         on public.services (lower(system));
create index if not exists services_tags_idx           on public.services using gin (tags);
create index if not exists services_search_idx         on public.services using gin (search_vector);

-- =============================================================================
-- 3. TRIGGERS (búsqueda, etiquetas, updated_at, archivo SoapUI)
-- =============================================================================

-- Se redefine la función común para añadir la rama de services.
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
    -- Se indexan los identificadores (URL, rutas, SOAPAction, DataPower), no los
    -- ejemplos de request/response ni las credenciales.
    v_body := concat_ws(' ',
      new.system, new.protocol, new.base_url, new.wsdl_url,
      new.datapower_domain, new.datapower_object, new.notes,
      (select string_agg(concat_ws(' ', o.op ->> 'name', o.op ->> 'method',
                                   o.op ->> 'path', o.op ->> 'soap_action'), ' ')
         from jsonb_array_elements(new.operations) as o(op)));
  end if;

  new.search_vector := private.build_search_vector(new.title, new.description, new.tags, v_body);

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

-- El proyecto SoapUI debe existir en el bucket y ser visible para quien escribe
-- (SECURITY INVOKER: la consulta pasa por las políticas de Storage).
create or replace function private.services_validate_file()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_metadata jsonb;
begin
  if new.soapui_file_path is null then
    return new;
  end if;

  select o.metadata
    into v_metadata
  from storage.objects o
  where o.bucket_id = 'devhub-documents'
    and o.name = new.soapui_file_path;

  if not found then
    raise exception 'El archivo "%" no existe en devhub-documents o no tienes acceso', new.soapui_file_path
      using errcode = '23503';
  end if;

  new.soapui_file_size := coalesce((v_metadata ->> 'size')::bigint, new.soapui_file_size);
  return new;
end;
$$;

create or replace trigger services_10_validate_file
  before insert or update of soapui_file_path, soapui_file_size on public.services
  for each row execute function private.services_validate_file();

create or replace trigger services_20_before_write
  before insert or update on public.services
  for each row execute function private.resource_before_write();

-- =============================================================================
-- 4. RLS, PRIVILEGIOS Y POLÍTICAS (mismo modelo que el resto de recursos)
-- =============================================================================
alter table public.services enable row level security;

revoke all on table public.services from anon, authenticated;
grant select, delete on public.services to authenticated;
grant insert (title, description, system, protocol, base_url, wsdl_url, datapower_domain, datapower_object,
              auth_type, auth_username, auth_secret, auth_notes, notes, operations,
              soapui_file_path, soapui_file_name, soapui_file_size, tags, visibility),
      update (title, description, system, protocol, base_url, wsdl_url, datapower_domain, datapower_object,
              auth_type, auth_username, auth_secret, auth_notes, notes, operations,
              soapui_file_path, soapui_file_name, soapui_file_size, tags, visibility)
  on public.services to authenticated;

revoke all on function
  private.json_text_ok(jsonb, integer),
  private.json_pairs_ok(jsonb),
  private.service_operations_valid(jsonb),
  private.services_validate_file()
from public, anon;
grant execute on function
  private.json_text_ok(jsonb, integer),
  private.json_pairs_ok(jsonb),
  private.service_operations_valid(jsonb),
  private.services_validate_file()
to authenticated;

drop policy if exists services_select_own_or_public on public.services;
create policy services_select_own_or_public on public.services
  for select to authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

drop policy if exists services_insert_own on public.services;
create policy services_insert_own on public.services
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists services_update_own on public.services;
create policy services_update_own on public.services
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists services_delete_own_or_admin on public.services;
create policy services_delete_own_or_admin on public.services
  for delete to authenticated
  using (owner_id = (select auth.uid())
         or (visibility = 'public' and (select private.is_admin())));

-- =============================================================================
-- 5. FAVORITOS: nuevo tipo 'service'
-- =============================================================================
alter table public.user_favorites
  add column if not exists service_id uuid references public.services (id) on delete cascade;

alter table public.user_favorites drop constraint if exists user_favorites_exactly_one_resource;
alter table public.user_favorites
  add constraint user_favorites_exactly_one_resource
  check (num_nonnulls(script_id, lesson_id, note_id, manual_id, service_id) = 1);

-- La columna generada no se puede modificar: se vuelve a crear (no guarda datos propios).
alter table public.user_favorites drop column if exists resource_type;
alter table public.user_favorites add column resource_type text generated always as (
  case
    when script_id  is not null then 'script'
    when lesson_id  is not null then 'lesson'
    when note_id    is not null then 'note'
    when manual_id  is not null then 'manual'
    when service_id is not null then 'service'
  end
) stored;

create unique index if not exists user_favorites_service_key
  on public.user_favorites (service_id, user_id) where service_id is not null;

grant insert (service_id) on public.user_favorites to authenticated;

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
    )
  );

-- =============================================================================
-- 6. STORAGE: proyectos SoapUI (.xml) en el mismo bucket privado
-- =============================================================================
update storage.buckets
   set allowed_mime_types = array[
         'application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/plain',
         'text/markdown',
         'image/png',
         'image/jpeg',
         'image/webp',
         'application/xml',
         'text/xml'
       ]
 where id = 'devhub-documents';

drop policy if exists devhub_documents_insert_own on storage.objects;
create policy devhub_documents_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'devhub-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|xlsx|pptx|txt|md|png|jpg|jpeg|webp|xml)$'
  );

drop policy if exists devhub_documents_select_own_or_public on storage.objects;
create policy devhub_documents_select_own_or_public on storage.objects
  for select to authenticated
  using (
    bucket_id = 'devhub-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.manuals m
        where m.file_path = objects.name and m.visibility = 'public'
      )
      or exists (
        select 1 from public.services v
        where v.soapui_file_path = objects.name and v.visibility = 'public'
      )
    )
  );

drop policy if exists devhub_documents_delete_own_unlinked on storage.objects;
create policy devhub_documents_delete_own_unlinked on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'devhub-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.manuals m where m.file_path = objects.name)
    and not exists (select 1 from public.services v where v.soapui_file_path = objects.name)
  );

-- =============================================================================
-- 7. BÚSQUEDA GLOBAL Y PANEL: incluir servicios
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

commit;
