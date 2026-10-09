-- =============================================================================
-- DevHub Técnico · Pruebas del rol superadmin (migración 20261012000000)
-- Ejecutar COMPLETO en el SQL Editor. Crea tres usuarios ficticios (A, B y S),
-- simula sus sesiones y lo REVIERTE todo al final.
-- Resultado esperado: termina sin error ("Success. No rows returned").
-- Cualquier "FAIL Sxx" aborta con un mensaje que indica qué falló.
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'qa.a2@devhub.test',
   '{}', '{"username":"qa_a2"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'qa.b2@devhub.test',
   '{}', '{"username":"qa_b2"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'qa.s2@devhub.test',
   '{}', '{"username":"qa_s2"}', now(), now());

-- S pasa a superadmin (como postgres, igual que en producción).
update public.profiles set role = 'superadmin' where id = '00000000-0000-4000-8000-0000000000c2';

do $$
declare
  v_a       constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_b       constant uuid := '00000000-0000-4000-8000-0000000000b2';
  v_s       constant uuid := '00000000-0000-4000-8000-0000000000c2';
  v_private uuid;
  v_public  uuid;
  v_service uuid;
  v_rows    integer;
  v_n       integer;
begin
  -- ===== A crea un script privado, uno público y un servicio privado =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.scripts (title, content, category, language)
  values ('Script privado de A', 'select 1;', 'sql', 'sql') returning id into v_private;
  insert into public.scripts (title, content, category, language, visibility)
  values ('Script público de A', 'select 2;', 'sql', 'sql', 'public') returning id into v_public;
  insert into public.services (title, base_url, operations)
  values ('Servicio privado de A', 'https://api.qa.test',
          '[{"name": "consultar", "method": "GET", "path": "/clientes"}]'::jsonb)
  returning id into v_service;

  -- ===== B (usuario normal) no toca nada ajeno =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);

  update public.scripts set title = 'Editado por B' where id in (v_private, v_public);
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL S01: un usuario normal editó recursos ajenos'; end if;

  delete from public.scripts where id = v_public;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL S02: un usuario normal eliminó un recurso ajeno'; end if;
  raise notice 'PASS S01-S02: un usuario normal no edita ni elimina lo ajeno';

  -- ===== S (superadmin) puede todo =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.scripts where id = v_private;
  if v_n <> 1 then raise exception 'FAIL S03: el superadmin no ve un recurso privado ajeno'; end if;
  raise notice 'PASS S03: el superadmin ve recursos privados ajenos';

  update public.scripts set title = 'Editado por el superadmin' where id = v_private;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL S04: el superadmin no pudo editar un recurso ajeno'; end if;
  if (select owner_id from public.scripts where id = v_private) <> v_a then
    raise exception 'FAIL S04: la edición cambió el propietario';
  end if;
  raise notice 'PASS S04: el superadmin edita lo ajeno sin cambiar el propietario';

  update public.services set operations = '[]'::jsonb where id = v_service;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL S05: el superadmin no pudo editar un servicio ajeno'; end if;
  raise notice 'PASS S05: el superadmin edita servicios ajenos';

  delete from public.scripts where id in (v_private, v_public);
  get diagnostics v_rows = row_count;
  if v_rows <> 2 then raise exception 'FAIL S06: el superadmin no pudo eliminar recursos ajenos'; end if;
  raise notice 'PASS S06: el superadmin elimina recursos ajenos (privados y públicos)';

  begin
    update public.profiles set role = 'superadmin' where id = v_b;
    raise exception 'FAIL S07: se pudo asignar un rol desde la API';
  exception when insufficient_privilege then
    raise notice 'PASS S07: ni el superadmin puede cambiar roles desde la API';
  end;

  execute 'reset role';
end $$;

rollback;
