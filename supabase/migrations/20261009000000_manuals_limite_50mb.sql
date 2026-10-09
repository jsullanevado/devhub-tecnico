-- =============================================================================
-- DevHub Técnico · Límite de tamaño de manuales: 20 MB -> 50 MB
-- -----------------------------------------------------------------------------
-- 50 MB es el máximo por archivo del plan Free de Supabase (Storage → Settings →
-- "Upload file size limit"). Para subirlo más, cambiar ese ajuste global (plan Pro)
-- y los tres valores de este archivo y de MANUAL_MAX_FILE_BYTES en el frontend.
-- Idempotente. Se ejecuta en una única transacción.
-- =============================================================================

begin;

-- 1. Restricción de la tabla manuals.
alter table public.manuals drop constraint if exists manuals_file_size_range;
alter table public.manuals
  add constraint manuals_file_size_range check (file_size between 1 and 52428800);  -- 50 MB

-- 2. Límite del bucket (Storage rechaza la subida antes de llegar a la tabla).
update storage.buckets
   set file_size_limit = 52428800  -- 50 MB
 where id = 'devhub-documents';

commit;
