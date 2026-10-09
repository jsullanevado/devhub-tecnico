-- =============================================================================
-- DevHub Técnico · Etapa 1 · Resumen de validación (solo lectura)
-- Versión de una sola consulta de etapa1_validacion.sql: el SQL Editor solo
-- muestra el último resultado, así que aquí cada comprobación es una fila.
-- Esperado: ok = true en todas las filas. Si alguna da false, revisar el bloque
-- V correspondiente de etapa1_validacion.sql para ver el detalle.
-- =============================================================================

with checks (orden, bloque, comprobacion, esperado, obtenido) as (
  values
  (1, 'V1', 'Tablas de la app con RLS activo', '6',
   (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
       and c.relname in ('profiles', 'scripts', 'lessons_learned', 'notes', 'manuals', 'user_favorites'))),

  (2, 'V2', 'Tablas de public SIN RLS', '0',
   (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity)),

  (3, 'V3', 'Políticas (21 en public + 3 en storage)', '24',
   (select count(*)::text from pg_policies
     where schemaname = 'public' or (schemaname = 'storage' and policyname like 'devhub_documents_%'))),

  (4, 'V4', 'Privilegios de tabla de anon', '0',
   (select count(*)::text from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon')),

  (5, 'V4', 'Privilegios de authenticated distintos de SELECT/DELETE', '0',
   (select count(*)::text from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'authenticated'
       and privilege_type not in ('SELECT', 'DELETE'))),

  (6, 'V5', 'Columnas protegidas escribibles por el cliente', '0',
   (select (has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')::int
          + has_column_privilege('authenticated', 'public.scripts', 'owner_id', 'INSERT')::int
          + has_column_privilege('authenticated', 'public.scripts', 'owner_id', 'UPDATE')::int
          + has_column_privilege('authenticated', 'public.manuals', 'download_count', 'UPDATE')::int
          + has_column_privilege('authenticated', 'public.notes', 'search_vector', 'UPDATE')::int
          + has_column_privilege('authenticated', 'public.user_favorites', 'user_id', 'INSERT')::int)::text)),

  (7, 'V6', 'Índices GIN (search_vector + tags)', '8',
   (select count(*)::text from pg_indexes
     where schemaname = 'public' and indexdef ilike '%using gin%')),

  (8, 'V6', 'Índices únicos de favoritos y username', '5',
   (select count(*)::text from pg_indexes
     where schemaname = 'public'
       and indexname in ('user_favorites_script_key', 'user_favorites_lesson_key', 'user_favorites_note_key',
                         'user_favorites_manual_key', 'profiles_username_lower_key'))),

  (9, 'V7', 'Triggers de la app activos', '7',
   (select count(*)::text from pg_trigger
     where not tgisinternal and tgenabled <> 'D'
       and tgname in ('on_auth_user_created', 'profiles_set_updated_at', 'scripts_before_write',
                      'lessons_learned_before_write', 'notes_before_write',
                      'manuals_10_validate_file', 'manuals_20_before_write'))),

  (10, 'V8', 'Funciones SECURITY DEFINER (is_admin, handle_new_user, register_manual_download)', '3',
   (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef)),

  (11, 'V8', 'Funciones sin search_path fijo', '0',
   (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and not coalesce(p.proconfig @> array['search_path=""'], false))),

  (12, 'V9', 'anon puede ejecutar las RPC', 'false',
   (select (has_function_privilege('anon', 'public.search_resources(text, text[], integer, integer)', 'EXECUTE')
         or has_function_privilege('anon', 'public.register_manual_download(uuid)', 'EXECUTE'))::text)),

  (13, 'V9', 'authenticated puede ejecutar las RPC', 'true',
   (select (has_function_privilege('authenticated', 'public.search_resources(text, text[], integer, integer)', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.register_manual_download(uuid)', 'EXECUTE'))::text)),

  (14, 'V10', 'Bucket privado', 'false',
   (select public::text from storage.buckets where id = 'devhub-documents')),

  (15, 'V10', 'Límite del bucket (50 MB)', '52428800',
   (select file_size_limit::text from storage.buckets where id = 'devhub-documents')),

  (16, 'V10', 'Tipos MIME permitidos', '9',
   (select cardinality(allowed_mime_types)::text from storage.buckets where id = 'devhub-documents')),

  (17, 'V11', 'Búsqueda insensible a tildes', 'true',
   (select (to_tsvector('public.spanish_unaccent', 'Configuración de autenticación SOAP')
            @@ websearch_to_tsquery('public.spanish_unaccent', 'configuracion autenticacion'))::text)),

  (18, 'V12', 'Normalización de etiquetas', '{oracle,sql}',
   (select private.normalize_tags(array['SQL', '  Oracle ', 'sql', ''])::text))
)
select bloque, comprobacion, esperado, coalesce(obtenido, '(nada)') as obtenido,
       obtenido is not distinct from esperado as ok
from checks
order by orden;
