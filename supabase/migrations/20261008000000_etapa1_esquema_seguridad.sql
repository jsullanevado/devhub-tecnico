-- =============================================================================
-- DevHub Técnico · Etapa 1 · Esquema, seguridad (RLS), búsqueda y Storage
-- -----------------------------------------------------------------------------
-- Destino : proyecto NUEVO de Supabase (PostgreSQL 15+).
-- Ejecutar: SQL Editor del panel (rol postgres) o `supabase db push`.
-- Idempotente: puede re-ejecutarse sin duplicar objetos.
-- Se ejecuta en una única transacción: si algo falla, no queda nada a medias.
--
-- Orden de secciones:
--   0. Extensiones y esquema privado
--   1. Configuración de búsqueda (FTS en español sin acentos)
--   2. Funciones auxiliares sin dependencias de tablas
--   3. Tablas, restricciones e índices
--   4. Funciones dependientes de tablas (roles, triggers)
--   5. Triggers
--   6. RLS y privilegios (GRANT/REVOKE)
--   7. Políticas RLS
--   8. Funciones RPC expuestas a la API
--   9. Storage: bucket y políticas
-- =============================================================================

begin;

-- =============================================================================
-- 0. EXTENSIONES Y ESQUEMA PRIVADO
-- =============================================================================
-- unaccent: búsqueda insensible a tildes ("configuracion" = "configuración").
create extension if not exists unaccent with schema extensions;

-- Esquema "private": funciones internas NO expuestas por la API REST
-- (PostgREST solo expone "public" por defecto).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, supabase_auth_admin;

-- =============================================================================
-- 1. CONFIGURACIÓN DE BÚSQUEDA DE TEXTO COMPLETO
-- =============================================================================
-- Copia de la configuración "spanish" con unaccent antes del stemming.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_ts_config
    where cfgname = 'spanish_unaccent' and cfgnamespace = 'public'::regnamespace
  ) then
    create text search configuration public.spanish_unaccent (copy = pg_catalog.spanish);
    alter text search configuration public.spanish_unaccent
      alter mapping for hword, hword_part, word
      with extensions.unaccent, pg_catalog.spanish_stem;
  end if;
end $$;

-- =============================================================================
-- 2. FUNCIONES AUXILIARES (sin dependencias de tablas)
-- =============================================================================

-- Normaliza etiquetas: minúsculas, sin espacios laterales, sin vacíos ni duplicados.
create or replace function private.normalize_tags(p_tags text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(s.tag order by s.tag), '{}'::text[])
  from (
    select distinct lower(btrim(u.raw)) as tag
    from unnest(coalesce(p_tags, '{}'::text[])) as u(raw)
    where btrim(u.raw) <> ''
  ) as s;
$$;

-- Valida etiquetas: máx. 20, 1-40 caracteres, alfanuméricos (incluye tildes) y . # + _ -
create or replace function private.tags_are_valid(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tags is not null
     and cardinality(p_tags) <= 20
     and not exists (
       select 1 from unnest(p_tags) as u(tag)
       where u.tag !~ '^[[:alnum:].#+][[:alnum:].#+_-]{0,39}$'
     );
$$;

-- Construye el tsvector ponderado: título (A) > etiquetas y descripción (B) > cuerpo (C).
create or replace function private.build_search_vector(
  p_title text,
  p_description text,
  p_tags text[],
  p_body text
)
returns tsvector
language sql
stable
set search_path = ''
as $$
  select
      setweight(to_tsvector('public.spanish_unaccent'::regconfig, coalesce(p_title, '')), 'A')
   || setweight(to_tsvector('public.spanish_unaccent'::regconfig,
                            array_to_string(coalesce(p_tags, '{}'::text[]), ' ')), 'B')
   || setweight(to_tsvector('public.spanish_unaccent'::regconfig, coalesce(p_description, '')), 'B')
   || setweight(to_tsvector('public.spanish_unaccent'::regconfig,
                            left(coalesce(p_body, ''), 100000)), 'C');
$$;

-- =============================================================================
-- 3. TABLAS, RESTRICCIONES E ÍNDICES
-- =============================================================================
-- Convenciones comunes de los recursos (scripts, lessons_learned, notes, manuals):
--   owner_id   : default auth.uid(); el cliente NO tiene privilegio para escribirlo.
--   visibility : 'private' (solo propietario) | 'public' (todos los autenticados).
--                'anon' nunca accede. Por defecto 'private' (mínimo privilegio).
--   tags       : normalizadas por trigger y validadas por CHECK.
--   search_vector: mantenido exclusivamente por trigger.
--   Eliminación: ON DELETE CASCADE desde auth.users -> profiles -> recursos -> favoritos.

-- 3.1 profiles ----------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text,
  full_name   text,
  avatar_url  text,
  bio         text,
  role        text not null default 'user',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_username_format  check (username is null or username ~ '^[A-Za-z0-9_.-]{3,30}$'),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) between 1 and 120),
  constraint profiles_avatar_url_format check (avatar_url is null
                                               or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  constraint profiles_bio_length       check (bio is null or char_length(bio) <= 500),
  constraint profiles_role_valid       check (role in ('user', 'admin'))
);
comment on table public.profiles is
  'Perfil público del usuario. El email vive solo en auth.users. role solo se modifica desde SQL/service_role.';

create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- 3.2 scripts -----------------------------------------------------------------
create table if not exists public.scripts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title         text not null,
  description   text,
  content       text not null,
  category      text not null default 'other',
  language      text not null default 'plaintext',
  is_template   boolean not null default false,
  tags          text[] not null default '{}',
  visibility    text not null default 'private',
  search_vector tsvector,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint scripts_title_length       check (char_length(btrim(title)) between 3 and 200),
  constraint scripts_description_length check (description is null or char_length(description) <= 2000),
  constraint scripts_content_length     check (char_length(content) between 1 and 200000),
  -- Para ampliar categorías: ALTER TABLE ... DROP/ADD CONSTRAINT scripts_category_valid.
  constraint scripts_category_valid     check (category in ('soap', 'rest', 'sql', 'bash', 'powershell',
                                                            'python', 'javascript', 'graphql', 'other')),
  -- Lenguaje para el resaltado de sintaxis (identificador del editor).
  constraint scripts_language_format    check (language ~ '^[a-z0-9+#-]{1,30}$'),
  constraint scripts_tags_valid         check (private.tags_are_valid(tags)),
  constraint scripts_visibility_valid   check (visibility in ('private', 'public'))
);

create index if not exists scripts_owner_updated_idx  on public.scripts (owner_id, updated_at desc);
create index if not exists scripts_public_updated_idx on public.scripts (updated_at desc) where visibility = 'public';
create index if not exists scripts_category_idx       on public.scripts (category);
create index if not exists scripts_tags_idx           on public.scripts using gin (tags);
create index if not exists scripts_search_idx         on public.scripts using gin (search_vector);

-- 3.3 lessons_learned ---------------------------------------------------------
create table if not exists public.lessons_learned (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title         text not null,
  description   text,
  problem       text not null,
  root_cause    text,
  solution      text,
  conclusion    text,
  severity      text not null default 'medium',
  technology    text,
  category      text not null default 'other',
  status        text not null default 'open',
  occurred_on   date,
  tags          text[] not null default '{}',
  visibility    text not null default 'private',
  search_vector tsvector,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint lessons_title_length       check (char_length(btrim(title)) between 3 and 200),
  constraint lessons_description_length check (description is null or char_length(description) <= 2000),
  constraint lessons_problem_length     check (char_length(problem) between 1 and 20000),
  constraint lessons_root_cause_length  check (root_cause is null or char_length(root_cause) <= 20000),
  constraint lessons_solution_length    check (solution is null or char_length(solution) <= 20000),
  constraint lessons_conclusion_length  check (conclusion is null or char_length(conclusion) <= 20000),
  constraint lessons_severity_valid     check (severity in ('low', 'medium', 'high', 'critical')),
  constraint lessons_technology_length  check (technology is null or char_length(technology) between 1 and 60),
  constraint lessons_category_valid     check (category in ('bug', 'performance', 'security', 'infrastructure',
                                                            'integration', 'configuration', 'process', 'other')),
  constraint lessons_status_valid       check (status in ('open', 'resolved', 'archived')),
  -- Una incidencia resuelta debe documentar su solución.
  constraint lessons_resolved_has_solution check (status <> 'resolved'
                                                  or (solution is not null and btrim(solution) <> '')),
  constraint lessons_tags_valid         check (private.tags_are_valid(tags)),
  constraint lessons_visibility_valid   check (visibility in ('private', 'public'))
);

create index if not exists lessons_owner_updated_idx  on public.lessons_learned (owner_id, updated_at desc);
create index if not exists lessons_public_updated_idx on public.lessons_learned (updated_at desc) where visibility = 'public';
create index if not exists lessons_severity_idx       on public.lessons_learned (severity);
create index if not exists lessons_category_idx       on public.lessons_learned (category);
create index if not exists lessons_status_idx         on public.lessons_learned (status);
create index if not exists lessons_technology_idx     on public.lessons_learned (lower(technology));
create index if not exists lessons_tags_idx           on public.lessons_learned using gin (tags);
create index if not exists lessons_search_idx         on public.lessons_learned using gin (search_vector);

-- 3.4 notes -------------------------------------------------------------------
create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title         text not null,
  description   text,
  content       text not null,               -- Markdown
  category      text not null default 'general',
  tags          text[] not null default '{}',
  visibility    text not null default 'private',
  search_vector tsvector,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint notes_title_length       check (char_length(btrim(title)) between 3 and 200),
  constraint notes_description_length check (description is null or char_length(description) <= 2000),
  constraint notes_content_length     check (char_length(content) between 1 and 100000),
  constraint notes_category_valid     check (category in ('general', 'article', 'wiki', 'howto', 'reference')),
  constraint notes_tags_valid         check (private.tags_are_valid(tags)),
  constraint notes_visibility_valid   check (visibility in ('private', 'public'))
);

create index if not exists notes_owner_updated_idx  on public.notes (owner_id, updated_at desc);
create index if not exists notes_public_updated_idx on public.notes (updated_at desc) where visibility = 'public';
create index if not exists notes_category_idx       on public.notes (category);
create index if not exists notes_tags_idx           on public.notes using gin (tags);
create index if not exists notes_search_idx         on public.notes using gin (search_vector);

-- 3.5 manuals -----------------------------------------------------------------
-- file_path = ruta del objeto en el bucket: '{owner_id}/{uuid}.{ext}'.
-- El nombre original del archivo se guarda en file_name (solo informativo).
-- mime_type y file_size se toman de storage.objects por trigger (no se confía en el cliente).
-- Mantener la lista de MIME sincronizada con la sección 9 (bucket).
create table if not exists public.manuals (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title          text not null,
  description    text,
  category       text not null default 'manual',
  version        text,
  file_path      text not null,
  file_name      text not null,
  mime_type      text not null,
  file_size      bigint not null,
  download_count integer not null default 0,
  tags           text[] not null default '{}',
  visibility     text not null default 'private',
  search_vector  tsvector,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint manuals_file_path_key        unique (file_path),
  constraint manuals_title_length         check (char_length(btrim(title)) between 3 and 200),
  constraint manuals_description_length   check (description is null or char_length(description) <= 2000),
  constraint manuals_category_valid       check (category in ('manual', 'architecture', 'reference', 'guide', 'other')),
  constraint manuals_version_length       check (version is null or char_length(version) between 1 and 30),
  constraint manuals_file_path_format     check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|xlsx|pptx|txt|md|png|jpg|jpeg|webp)$'),
  constraint manuals_file_path_owner      check (split_part(file_path, '/', 1) = owner_id::text),
  constraint manuals_file_name_length     check (char_length(file_name) between 1 and 255),
  constraint manuals_mime_type_valid      check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp'
  )),
  constraint manuals_file_size_range      check (file_size between 1 and 20971520),  -- 20 MB
  constraint manuals_download_count_valid check (download_count >= 0),
  constraint manuals_tags_valid           check (private.tags_are_valid(tags)),
  constraint manuals_visibility_valid     check (visibility in ('private', 'public'))
);

create index if not exists manuals_owner_updated_idx  on public.manuals (owner_id, updated_at desc);
create index if not exists manuals_public_updated_idx on public.manuals (updated_at desc) where visibility = 'public';
create index if not exists manuals_category_idx       on public.manuals (category);
create index if not exists manuals_tags_idx           on public.manuals using gin (tags);
create index if not exists manuals_search_idx         on public.manuals using gin (search_vector);

-- 3.6 user_favorites ----------------------------------------------------------
-- Una FK por tipo de recurso (en lugar de un resource_id polimórfico) para tener
-- integridad referencial real y borrado en cascada cuando se elimina el recurso.
create table if not exists public.user_favorites (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  script_id     uuid references public.scripts (id) on delete cascade,
  lesson_id     uuid references public.lessons_learned (id) on delete cascade,
  note_id       uuid references public.notes (id) on delete cascade,
  manual_id     uuid references public.manuals (id) on delete cascade,
  resource_type text generated always as (
    case
      when script_id is not null then 'script'
      when lesson_id is not null then 'lesson'
      when note_id   is not null then 'note'
      when manual_id is not null then 'manual'
    end
  ) stored,
  created_at    timestamptz not null default now(),
  constraint user_favorites_exactly_one_resource
    check (num_nonnulls(script_id, lesson_id, note_id, manual_id) = 1)
);

-- Unicidad por usuario y recurso (también sirven para el borrado en cascada).
create unique index if not exists user_favorites_script_key on public.user_favorites (script_id, user_id) where script_id is not null;
create unique index if not exists user_favorites_lesson_key on public.user_favorites (lesson_id, user_id) where lesson_id is not null;
create unique index if not exists user_favorites_note_key   on public.user_favorites (note_id, user_id)   where note_id   is not null;
create unique index if not exists user_favorites_manual_key on public.user_favorites (manual_id, user_id) where manual_id is not null;
create index if not exists user_favorites_user_created_idx  on public.user_favorites (user_id, created_at desc);

-- =============================================================================
-- 4. FUNCIONES DEPENDIENTES DE TABLAS
-- =============================================================================

-- 4.1 ¿El usuario actual es administrador?
-- SECURITY DEFINER para leer profiles sin pasar por RLS (evita recursión en políticas).
-- Solo devuelve un booleano sobre el propio usuario; search_path vacío.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

-- 4.2 Crear perfil al registrarse.
-- Nunca toma el rol de raw_user_meta_data (el cliente controla esos datos).
-- Un username inválido o repetido se descarta: el registro no debe fallar por ello.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username  text := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  v_full_name text := left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 120);
begin
  if v_username is not null and (
       v_username !~ '^[A-Za-z0-9_.-]{3,30}$'
       or exists (select 1 from public.profiles p where lower(p.username) = lower(v_username))
     ) then
    v_username := null;
  end if;

  begin
    insert into public.profiles (id, username, full_name)
    values (new.id, v_username, v_full_name)
    on conflict (id) do nothing;
  exception when unique_violation then
    -- Carrera concurrente por el mismo username: se crea el perfil sin él.
    insert into public.profiles (id, full_name)
    values (new.id, v_full_name)
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

-- 4.3 updated_at genérico (profiles).
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 4.4 Antes de escribir un recurso: normaliza etiquetas, recalcula search_vector
-- y actualiza updated_at. SECURITY INVOKER: no eleva privilegios.
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
  end if;

  new.search_vector := private.build_search_vector(new.title, new.description, new.tags, v_body);

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

-- 4.5 manuals: el archivo debe existir en el bucket y ser visible para quien escribe.
-- SECURITY INVOKER: la consulta a storage.objects pasa por las políticas de Storage,
-- por lo que un usuario solo puede vincular archivos de su propia carpeta.
create or replace function private.manuals_validate_file()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_metadata jsonb;
begin
  select o.metadata
    into v_metadata
  from storage.objects o
  where o.bucket_id = 'devhub-documents'
    and o.name = new.file_path;

  if not found then
    raise exception 'El archivo "%" no existe en devhub-documents o no tienes acceso', new.file_path
      using errcode = '23503';
  end if;

  -- Metadatos reales registrados por Storage al subir el archivo.
  new.mime_type := coalesce(v_metadata ->> 'mimetype', new.mime_type);
  new.file_size := coalesce((v_metadata ->> 'size')::bigint, new.file_size);

  return new;
end;
$$;

-- =============================================================================
-- 5. TRIGGERS
-- =============================================================================
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace trigger scripts_before_write
  before insert or update on public.scripts
  for each row execute function private.resource_before_write();

create or replace trigger lessons_learned_before_write
  before insert or update on public.lessons_learned
  for each row execute function private.resource_before_write();

create or replace trigger notes_before_write
  before insert or update on public.notes
  for each row execute function private.resource_before_write();

-- Los triggers de manuals se limitan a columnas de contenido: incrementar
-- download_count no altera updated_at ni recalcula la búsqueda.
-- Se ejecutan en orden alfabético: primero 10_validate_file, luego 20_before_write.
create or replace trigger manuals_10_validate_file
  before insert or update of file_path, mime_type, file_size on public.manuals
  for each row execute function private.manuals_validate_file();

create or replace trigger manuals_20_before_write
  before insert or update of title, description, category, version, file_path,
                             file_name, mime_type, file_size, tags, visibility
  on public.manuals
  for each row execute function private.resource_before_write();

-- =============================================================================
-- 6. RLS Y PRIVILEGIOS
-- =============================================================================
-- RLS filtra FILAS; los GRANT por columna limitan QUÉ columnas puede escribir el
-- cliente (owner_id, role, download_count, search_vector, fechas quedan fuera).
-- Supabase concede ALL a anon/authenticated por defecto: se revoca y se concede lo mínimo.

alter table public.profiles        enable row level security;
alter table public.scripts         enable row level security;
alter table public.lessons_learned enable row level security;
alter table public.notes           enable row level security;
alter table public.manuals         enable row level security;
alter table public.user_favorites  enable row level security;

revoke all on table
  public.profiles, public.scripts, public.lessons_learned,
  public.notes, public.manuals, public.user_favorites
from anon, authenticated;

-- profiles: lectura y edición de campos no privilegiados (role excluido).
grant select on public.profiles to authenticated;
grant update (username, full_name, avatar_url, bio) on public.profiles to authenticated;

-- scripts
grant select, delete on public.scripts to authenticated;
grant insert (title, description, content, category, language, is_template, tags, visibility),
      update (title, description, content, category, language, is_template, tags, visibility)
  on public.scripts to authenticated;

-- lessons_learned
grant select, delete on public.lessons_learned to authenticated;
grant insert (title, description, problem, root_cause, solution, conclusion, severity,
              technology, category, status, occurred_on, tags, visibility),
      update (title, description, problem, root_cause, solution, conclusion, severity,
              technology, category, status, occurred_on, tags, visibility)
  on public.lessons_learned to authenticated;

-- notes
grant select, delete on public.notes to authenticated;
grant insert (title, description, content, category, tags, visibility),
      update (title, description, content, category, tags, visibility)
  on public.notes to authenticated;

-- manuals (download_count solo cambia vía RPC register_manual_download)
grant select, delete on public.manuals to authenticated;
grant insert (title, description, category, version, file_path, file_name, mime_type, file_size, tags, visibility),
      update (title, description, category, version, file_path, file_name, mime_type, file_size, tags, visibility)
  on public.manuals to authenticated;

-- user_favorites: sin UPDATE (desmarcar = DELETE, marcar = INSERT).
grant select, delete on public.user_favorites to authenticated;
grant insert (script_id, lesson_id, note_id, manual_id) on public.user_favorites to authenticated;

-- Funciones privadas: nadie las ejecuta salvo lo estrictamente necesario.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_admin(),
  private.normalize_tags(text[]),
  private.tags_are_valid(text[]),
  private.build_search_vector(text, text, text[], text),
  private.set_updated_at(),
  private.resource_before_write(),
  private.manuals_validate_file()
to authenticated;
grant execute on function private.handle_new_user() to supabase_auth_admin;

-- =============================================================================
-- 7. POLÍTICAS RLS
-- =============================================================================
-- Modelo de permisos:
--   profiles  : lectura para autenticados; cada uno edita solo su perfil.
--               INSERT/DELETE sin política (los gestiona el trigger y el borrado de auth.users).
--   recursos  : SELECT  -> públicos o propios.
--               INSERT  -> owner_id = auth.uid().
--               UPDATE  -> solo propios (no se puede transferir la propiedad).
--               DELETE  -> propios; admin puede moderar (borrar) solo recursos públicos.
--   favoritos : cada usuario gestiona solo los suyos, y solo sobre recursos que puede ver.
--   anon      : sin privilegios en ninguna tabla.

-- 7.1 profiles ----------------------------------------------------------------
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 7.2 scripts -----------------------------------------------------------------
drop policy if exists scripts_select_own_or_public on public.scripts;
create policy scripts_select_own_or_public on public.scripts
  for select to authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

drop policy if exists scripts_insert_own on public.scripts;
create policy scripts_insert_own on public.scripts
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists scripts_update_own on public.scripts;
create policy scripts_update_own on public.scripts
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists scripts_delete_own_or_admin on public.scripts;
create policy scripts_delete_own_or_admin on public.scripts
  for delete to authenticated
  using (owner_id = (select auth.uid())
         or (visibility = 'public' and (select private.is_admin())));

-- 7.3 lessons_learned ---------------------------------------------------------
drop policy if exists lessons_select_own_or_public on public.lessons_learned;
create policy lessons_select_own_or_public on public.lessons_learned
  for select to authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

drop policy if exists lessons_insert_own on public.lessons_learned;
create policy lessons_insert_own on public.lessons_learned
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists lessons_update_own on public.lessons_learned;
create policy lessons_update_own on public.lessons_learned
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists lessons_delete_own_or_admin on public.lessons_learned;
create policy lessons_delete_own_or_admin on public.lessons_learned
  for delete to authenticated
  using (owner_id = (select auth.uid())
         or (visibility = 'public' and (select private.is_admin())));

-- 7.4 notes -------------------------------------------------------------------
drop policy if exists notes_select_own_or_public on public.notes;
create policy notes_select_own_or_public on public.notes
  for select to authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own on public.notes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists notes_update_own on public.notes;
create policy notes_update_own on public.notes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists notes_delete_own_or_admin on public.notes;
create policy notes_delete_own_or_admin on public.notes
  for delete to authenticated
  using (owner_id = (select auth.uid())
         or (visibility = 'public' and (select private.is_admin())));

-- 7.5 manuals -----------------------------------------------------------------
drop policy if exists manuals_select_own_or_public on public.manuals;
create policy manuals_select_own_or_public on public.manuals
  for select to authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

drop policy if exists manuals_insert_own on public.manuals;
create policy manuals_insert_own on public.manuals
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists manuals_update_own on public.manuals;
create policy manuals_update_own on public.manuals
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists manuals_delete_own_or_admin on public.manuals;
create policy manuals_delete_own_or_admin on public.manuals
  for delete to authenticated
  using (owner_id = (select auth.uid())
         or (visibility = 'public' and (select private.is_admin())));

-- 7.6 user_favorites ----------------------------------------------------------
drop policy if exists user_favorites_select_own on public.user_favorites;
create policy user_favorites_select_own on public.user_favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Las subconsultas pasan por el RLS del recurso: solo se puede marcar lo visible.
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
    )
  );

drop policy if exists user_favorites_delete_own on public.user_favorites;
create policy user_favorites_delete_own on public.user_favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Sin política UPDATE en user_favorites: denegado por defecto (y sin GRANT).

-- =============================================================================
-- 8. FUNCIONES RPC EXPUESTAS A LA API
-- =============================================================================

-- 8.1 Búsqueda global (Ctrl+K). SECURITY INVOKER: respeta el RLS de cada tabla.
-- p_types: null = todos | subconjunto de {'script','lesson','note','manual'}.
-- Sintaxis de consulta estilo web: "jwt oauth", "\"error 500\"", "soap -wsdl".
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
  ) as r
  order by r.rank desc, r.updated_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_resources(text, text[], integer, integer) from public, anon;
grant execute on function public.search_resources(text, text[], integer, integer) to authenticated;

-- 8.2 Contador de descargas.
-- SECURITY DEFINER solo para incrementar download_count (columna no concedida al cliente).
-- Verifica explícitamente que el usuario pueda ver el manual. No toca updated_at.
-- El frontend debe invocarla únicamente en la acción explícita "Descargar", no en la vista previa.
create or replace function public.register_manual_download(p_manual_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Autenticación requerida' using errcode = '28000';
  end if;

  update public.manuals m
     set download_count = m.download_count + 1
   where m.id = p_manual_id
     and (m.visibility = 'public' or m.owner_id = v_uid)
  returning m.download_count into v_count;

  if not found then
    raise exception 'Manual no encontrado o sin permisos' using errcode = '42501';
  end if;

  return v_count;
end;
$$;

revoke all on function public.register_manual_download(uuid) from public, anon;
grant execute on function public.register_manual_download(uuid) to authenticated;

-- =============================================================================
-- 9. STORAGE: BUCKET devhub-documents Y POLÍTICAS
-- =============================================================================
-- Bucket PRIVADO: los manuales privados no deben ser accesibles por URL pública.
-- La lectura se hace con URLs firmadas de corta duración, que respetan estas políticas.
-- Ruta obligatoria: '{auth.uid()}/{uuid}.{ext}'.
-- Archivos inmutables: no hay política UPDATE (sin upsert/move). Reemplazar un
-- documento = subir uno nuevo, actualizar manuals.file_path y borrar el anterior.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'devhub-documents',
  'devhub-documents',
  false,
  20971520,  -- 20 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Subida: solo en la carpeta propia, con nombre y extensión controlados.
drop policy if exists devhub_documents_insert_own on storage.objects;
create policy devhub_documents_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'devhub-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|xlsx|pptx|txt|md|png|jpg|jpeg|webp)$'
  );

-- Lectura: archivos propios o vinculados a un manual público.
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
    )
  );

-- Borrado: solo archivos propios que ya no estén referenciados por un manual
-- (orden correcto: borrar la fila de manuals y después el archivo).
drop policy if exists devhub_documents_delete_own_unlinked on storage.objects;
create policy devhub_documents_delete_own_unlinked on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'devhub-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.manuals m where m.file_path = objects.name
    )
  );

commit;
