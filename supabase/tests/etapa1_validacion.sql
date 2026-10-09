-- =============================================================================
-- DevHub Técnico · Etapa 1 · Consultas de validación (solo lectura)
-- Ejecutar cada bloque en el SQL Editor tras aplicar la migración.
-- =============================================================================

-- V1. Tablas de public y estado de RLS -> las 6 tablas con rls_activo = true
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by 1;

-- V2. Tablas expuestas SIN RLS -> 0 filas
select n.nspname, c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

-- V3. Políticas por tabla y operación
-- Esperado: profiles(SELECT, UPDATE); scripts/lessons_learned/notes/manuals(SELECT, INSERT, UPDATE, DELETE);
--           user_favorites(SELECT, INSERT, DELETE); storage.objects(INSERT, SELECT, DELETE) de devhub_documents_*
select schemaname, tablename, cmd, policyname, roles, qual, with_check
from pg_policies
where schemaname = 'public'
   or (schemaname = 'storage' and policyname like 'devhub_documents_%')
order by schemaname, tablename, cmd;

-- V4. Privilegios de tabla para anon/authenticated
-- Esperado: anon sin filas; authenticated solo SELECT (+ DELETE en recursos y favoritos).
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;

-- V5. Columnas protegidas -> todas en false
select
  has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')                  as role_update,
  has_column_privilege('authenticated', 'public.scripts', 'owner_id', 'INSERT')               as owner_insert,
  has_column_privilege('authenticated', 'public.scripts', 'owner_id', 'UPDATE')               as owner_update,
  has_column_privilege('authenticated', 'public.manuals', 'download_count', 'UPDATE')         as downloads_update,
  has_column_privilege('authenticated', 'public.notes', 'search_vector', 'UPDATE')            as search_vector_update,
  has_column_privilege('authenticated', 'public.user_favorites', 'user_id', 'INSERT')         as fav_user_insert;

-- V6. Índices -> GIN en search_vector y tags, índices únicos de favoritos y username
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- V7. Triggers (incluido on_auth_user_created en auth.users)
select tgrelid::regclass as tabla, tgname as trigger, tgenabled as estado
from pg_trigger
where not tgisinternal
  and tgrelid in ('auth.users'::regclass, 'public.profiles'::regclass, 'public.scripts'::regclass,
                  'public.lessons_learned'::regclass, 'public.notes'::regclass, 'public.manuals'::regclass)
order by 1, 2;

-- V8. Funciones: SECURITY DEFINER y search_path fijo
-- Esperado: solo is_admin, handle_new_user y register_manual_download con prosecdef = true;
--           todas con proconfig = {search_path=""}
select p.oid::regprocedure as funcion, p.prosecdef as security_definer, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
order by 1;

-- V9. Ejecución de RPC -> anon false, authenticated true
select
  has_function_privilege('anon', 'public.search_resources(text, text[], integer, integer)', 'EXECUTE')          as anon_search,
  has_function_privilege('authenticated', 'public.search_resources(text, text[], integer, integer)', 'EXECUTE') as auth_search,
  has_function_privilege('anon', 'public.register_manual_download(uuid)', 'EXECUTE')                           as anon_download,
  has_function_privilege('authenticated', 'public.register_manual_download(uuid)', 'EXECUTE')                  as auth_download;

-- V10. Bucket -> public = false, 52428800 (50 MB, migración 20261009000000), 9 MIME types
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'devhub-documents';

-- V11. Búsqueda insensible a tildes -> true
select to_tsvector('public.spanish_unaccent', 'Configuración de autenticación SOAP')
       @@ websearch_to_tsquery('public.spanish_unaccent', 'configuracion autenticacion') as fts_ok;

-- V12. Normalización y validación de etiquetas -> {oracle,sql} | true | false
select private.normalize_tags(array['SQL', '  Oracle ', 'sql', '']) as normalizadas,
       private.tags_are_valid(array['spring-boot', 'c#', '.net', 'autenticación']) as validas,
       private.tags_are_valid(array['con espacio']) as invalida;
