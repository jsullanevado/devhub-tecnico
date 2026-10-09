-- =============================================================================
-- DevHub Técnico · Rol "superadmin"
-- -----------------------------------------------------------------------------
-- Requiere: 20261008000000 … 20261011000000.
--
-- Reglas resultantes para scripts, lecciones, notas, manuales y servicios:
--   user       : crea; ve lo público y lo propio; edita y elimina SOLO lo propio.
--   admin      : como user + puede eliminar recursos públicos ajenos (moderación).
--   superadmin : ve, edita y elimina TODO, de cualquier autor, incluidos los
--                recursos privados ajenos. Crea a su propio nombre.
--
-- El rol solo se asigna por SQL (el cliente no tiene privilegio sobre profiles.role):
--   update public.profiles set role = 'superadmin' where id = '<uuid>';
-- Idempotente. Se ejecuta en una única transacción.
-- =============================================================================

begin;

-- 1. Nuevo valor de rol.
alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles
  add constraint profiles_role_valid check (role in ('user', 'admin', 'superadmin'));

-- 2. ¿El usuario actual es superadmin? Mismo patrón que private.is_admin():
-- SECURITY DEFINER para leer profiles sin recursión en las políticas.
create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'superadmin'
  );
$$;

revoke all on function private.is_superadmin() from public, anon;
grant execute on function private.is_superadmin() to authenticated;

-- 3. Políticas de los recursos (mismos nombres; INSERT no cambia: siempre a nombre propio).
do $$
declare
  v_table  text;
  v_prefix text;
begin
  for v_table, v_prefix in
    select * from (values
      ('scripts', 'scripts'),
      ('lessons_learned', 'lessons'),
      ('notes', 'notes'),
      ('manuals', 'manuals'),
      ('services', 'services')
    ) as t(table_name, policy_prefix)
  loop
    execute format('drop policy if exists %I on public.%I', v_prefix || '_select_own_or_public', v_table);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using (visibility = 'public'
               or owner_id = (select auth.uid())
               or (select private.is_superadmin()))
    $p$, v_prefix || '_select_own_or_public', v_table);

    execute format('drop policy if exists %I on public.%I', v_prefix || '_update_own', v_table);
    execute format($p$
      create policy %I on public.%I
        for update to authenticated
        using (owner_id = (select auth.uid()) or (select private.is_superadmin()))
        with check (owner_id = (select auth.uid()) or (select private.is_superadmin()))
    $p$, v_prefix || '_update_own', v_table);

    execute format('drop policy if exists %I on public.%I', v_prefix || '_delete_own_or_admin', v_table);
    execute format($p$
      create policy %I on public.%I
        for delete to authenticated
        using (owner_id = (select auth.uid())
               or (visibility = 'public' and (select private.is_admin()))
               or (select private.is_superadmin()))
    $p$, v_prefix || '_delete_own_or_admin', v_table);
  end loop;
end $$;

-- 4. Storage. El superadmin puede:
--    - leer cualquier archivo del bucket;
--    - subir en la carpeta del PROPIETARIO del recurso (al sustituir el archivo de un
--      manual o el proyecto SoapUI de un servicio ajeno; así se mantiene la regla
--      "ruta = {owner_id}/…" de las tablas);
--    - borrar archivos que ya no estén vinculados a ningún manual ni servicio.
drop policy if exists devhub_documents_insert_own on storage.objects;
create policy devhub_documents_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'devhub-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select private.is_superadmin()))
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|xlsx|pptx|txt|md|png|jpg|jpeg|webp|xml)$'
  );

drop policy if exists devhub_documents_select_own_or_public on storage.objects;
create policy devhub_documents_select_own_or_public on storage.objects
  for select to authenticated
  using (
    bucket_id = 'devhub-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_superadmin())
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
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select private.is_superadmin()))
    and not exists (select 1 from public.manuals m where m.file_path = objects.name)
    and not exists (select 1 from public.services v where v.soapui_file_path = objects.name)
  );

-- 5. Contador de descargas: el superadmin también puede descargar manuales privados ajenos.
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
     and (m.visibility = 'public' or m.owner_id = v_uid or private.is_superadmin())
  returning m.download_count into v_count;

  if not found then
    raise exception 'Manual no encontrado o sin permisos' using errcode = '42501';
  end if;

  return v_count;
end;
$$;

revoke all on function public.register_manual_download(uuid) from public, anon;
grant execute on function public.register_manual_download(uuid) to authenticated;

commit;
