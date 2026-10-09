-- =============================================================================
-- DevHub Técnico · Etapa 1 · Pruebas funcionales de RLS y permisos
-- Ejecutar COMPLETO en el SQL Editor. Crea dos usuarios ficticios, simula sus
-- sesiones (rol authenticated + claims JWT) y lo REVIERTE todo al final.
-- Resultado esperado: solo mensajes "PASS"; cualquier "FAIL" aborta con error.
-- =============================================================================

begin;

-- Usuarios ficticios. A intenta inyectar role=admin en los metadatos.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'qa.a@devhub.test',
   '{}', '{"username":"qa_a","full_name":"QA Usuario A","role":"admin"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'qa.b@devhub.test',
   '{}', '{"username":"qa_b","full_name":"QA Usuario B"}', now(), now());

do $$
declare
  v_a          constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b          constant uuid := '00000000-0000-4000-8000-0000000000b1';
  v_private_id uuid;
  v_public_id  uuid;
  v_rows       integer;
  v_n          integer;
begin
  -- T01. Perfiles creados por trigger, sin rol inyectado
  select count(*) into v_n from public.profiles where id in (v_a, v_b) and role = 'user';
  if v_n <> 2 then raise exception 'FAIL T01: perfiles no creados o rol inyectado'; end if;
  raise notice 'PASS T01: perfiles creados con role=user';

  -- ===== Sesión usuario A =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.scripts (title, content, category, language, tags)
  values ('Consulta privada QA', 'select 1;', 'sql', 'sql', array['SQL', '  Oracle ', 'sql'])
  returning id into v_private_id;

  insert into public.scripts (title, description, content, category, language, visibility)
  values ('Petición SOAP de autenticación', 'Plantilla ficticia', '<soap:Envelope/>', 'soap', 'xml', 'public')
  returning id into v_public_id;
  raise notice 'PASS T02: A crea scripts propios';

  if (select s.tags from public.scripts s where s.id = v_private_id) <> array['oracle', 'sql']::text[] then
    raise exception 'FAIL T03: etiquetas no normalizadas';
  end if;
  raise notice 'PASS T03: etiquetas normalizadas';

  begin
    update public.profiles set role = 'admin' where id = v_a;
    raise exception 'FAIL T04: el usuario pudo cambiar su rol';
  exception when insufficient_privilege then
    raise notice 'PASS T04: cambio de rol denegado';
  end;

  update public.profiles set full_name = 'QA A editado' where id = v_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL T05: A no puede editar su perfil'; end if;
  raise notice 'PASS T05: A edita su propio perfil';

  -- ===== Sesión usuario B =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.scripts where owner_id = v_a;
  if v_n <> 1 then raise exception 'FAIL T06: B ve % scripts de A (esperado 1 público)', v_n; end if;
  raise notice 'PASS T06: B solo ve el script público de A';

  update public.scripts set title = 'Modificado por B' where id in (v_private_id, v_public_id);
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL T07: B modificó scripts de A'; end if;
  raise notice 'PASS T07: B no modifica recursos ajenos';

  delete from public.scripts where id in (v_private_id, v_public_id);
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL T08: B eliminó scripts de A'; end if;
  raise notice 'PASS T08: B no elimina recursos ajenos';

  begin
    insert into public.scripts (owner_id, title, content, category) values (v_a, 'Suplantación', 'x', 'sql');
    raise exception 'FAIL T09: B insertó a nombre de A';
  exception when insufficient_privilege then
    raise notice 'PASS T09: owner_id no es asignable por el cliente';
  end;

  update public.profiles set full_name = 'Modificado por B' where id = v_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL T10: B modificó el perfil de A'; end if;
  raise notice 'PASS T10: B no modifica perfiles ajenos';

  insert into public.user_favorites (script_id) values (v_public_id);
  raise notice 'PASS T11: B marca como favorito un recurso público';

  begin
    insert into public.user_favorites (script_id) values (v_public_id);
    raise exception 'FAIL T12: favorito duplicado permitido';
  exception when unique_violation then
    raise notice 'PASS T12: favorito duplicado rechazado';
  end;

  begin
    insert into public.user_favorites (script_id) values (v_private_id);
    raise exception 'FAIL T13: B marcó un recurso privado ajeno';
  exception when insufficient_privilege then
    raise notice 'PASS T13: no se puede marcar un recurso no visible';
  end;

  select count(*) into v_n from public.search_resources('autenticacion soap') r where r.owner_id = v_a;
  if v_n <> 1 then raise exception 'FAIL T14: búsqueda devolvió % resultados (esperado 1)', v_n; end if;
  select count(*) into v_n from public.search_resources('consulta privada') r where r.owner_id = v_a;
  if v_n <> 0 then raise exception 'FAIL T14: la búsqueda filtra recursos privados ajenos'; end if;
  raise notice 'PASS T14: búsqueda sin tildes y respetando RLS';

  begin
    insert into public.manuals (title, file_path, file_name)
    values ('Manual QA', v_b::text || '/' || gen_random_uuid()::text || '.pdf', 'qa.pdf');
    raise exception 'FAIL T15: manual creado sin archivo en Storage';
  exception when foreign_key_violation then
    raise notice 'PASS T15: manual exige archivo existente en el bucket';
  end;

  -- ===== Moderación: B pasa a admin (asignación vía SQL, como postgres) =====
  execute 'reset role';
  update public.profiles set role = 'admin' where id = v_b;
  execute 'set local role authenticated';

  delete from public.scripts where id = v_private_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL T16: admin eliminó un recurso privado ajeno'; end if;

  delete from public.scripts where id = v_public_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL T16: admin no pudo moderar un recurso público'; end if;
  raise notice 'PASS T16: admin modera solo recursos públicos';

  select count(*) into v_n from public.user_favorites where user_id = v_b;
  if v_n <> 0 then raise exception 'FAIL T17: favorito huérfano tras borrar el recurso'; end if;
  raise notice 'PASS T17: favoritos eliminados en cascada';

  -- ===== Sesión anónima =====
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';

  begin
    perform 1 from public.scripts limit 1;
    raise exception 'FAIL T18: anon puede leer scripts';
  exception when insufficient_privilege then
    raise notice 'PASS T18: anon sin acceso a tablas';
  end;

  begin
    perform 1 from public.search_resources('soap');
    raise exception 'FAIL T19: anon puede ejecutar search_resources';
  exception when insufficient_privilege then
    raise notice 'PASS T19: anon sin acceso a RPC';
  end;

  execute 'reset role';
end $$;

rollback;
