-- =============================================================================
-- DevHub Técnico · Pruebas de bases de datos, relaciones, carga masiva y MDI
-- (migración 20261013000000)
-- Ejecutar COMPLETO en el SQL Editor. Crea dos usuarios ficticios (A y B),
-- simula sus sesiones y lo REVIERTE todo al final.
-- Resultado esperado: termina sin error ("Success. No rows returned").
-- Cualquier "FAIL Rxx" aborta con un mensaje que indica qué falló.
-- =============================================================================

begin;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'qa.a3@devhub.test',
   '{}', '{"username":"qa_a3"}', now(), now()),
  ('00000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'qa.b3@devhub.test',
   '{}', '{"username":"qa_b3"}', now(), now());

do $$
declare
  v_a        constant uuid := '00000000-0000-4000-8000-0000000000a3';
  v_b        constant uuid := '00000000-0000-4000-8000-0000000000b3';
  v_db       uuid;
  v_db_pub   uuid;
  v_backend  uuid;
  v_dp       uuid;
  v_new_db   constant uuid := '00000000-0000-4000-8000-00000000d001';
  v_new_svc  constant uuid := '00000000-0000-4000-8000-00000000d002';
  v_json     jsonb;
  v_rows     integer;
  v_n        integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- ===== Conexiones =====
  insert into public.databases (title, engine, environment, host, port, service_name, username, password, objects, tags)
  values ('PROMDEV privada', 'oracle', 'dev', 'db.qa.test', 1521, 'PROMDEV', 'usr', 'secreta',
          '[{"type": "package", "schema": "USRPROM", "name": "PKG_CLIENTE",
             "members": ["SP_REGISTRAR_CLIENTE", "SP_CONSULTAR"]},
            {"type": "table", "schema": "USRPROM", "name": "CLIENTE"}]'::jsonb,
          array['Oracle', 'oracle', ' PROM '])
  returning id into v_db;
  if (select tags from public.databases where id = v_db) <> array['oracle', 'prom'] then
    raise exception 'FAIL R01: no se normalizaron las etiquetas de la conexión';
  end if;
  insert into public.databases (title, connection_string, visibility)
  values ('Conexión pública', 'jdbc:oracle:thin:@db:1521/X', 'public')
  returning id into v_db_pub;
  raise notice 'PASS R01: alta de conexiones (host o cadena) con objetos';

  begin
    insert into public.databases (title) values ('Sin forma de conectarse');
    raise exception 'FAIL R02: se aceptó una conexión sin host ni cadena';
  exception when check_violation then
    raise notice 'PASS R02: se exige host o cadena de conexión';
  end;

  begin
    insert into public.databases (title, host, objects)
    values ('Objeto inválido', 'h', '[{"type": "planeta", "name": "X"}]'::jsonb);
    raise exception 'FAIL R03: se aceptó un objeto de tipo desconocido';
  exception when check_violation then
    raise notice 'PASS R03: se validan los objetos de la conexión';
  end;

  -- ===== Servicio de backend y DataPower que enruta a él =====
  insert into public.services (title, kind, base_url, operations)
  values ('Backend clientes', 'service', 'https://backend.qa.test',
          jsonb_build_array(jsonb_build_object(
            'name', 'registrarCliente', 'method', 'POST',
            'db_refs', jsonb_build_array(jsonb_build_object(
              'database_id', v_db, 'object', 'USRPROM.PKG_CLIENTE', 'member', 'SP_REGISTRAR_CLIENTE')))))
  returning id into v_backend;

  insert into public.services (title, kind, base_url, datapower_domain, operations)
  values ('DP clientes', 'datapower', 'https://dp.qa.test', 'DOM_CLIENTES',
          jsonb_build_array(jsonb_build_object(
            'name', 'registrar',
            'targets', jsonb_build_array(jsonb_build_object(
              'service_id', v_backend, 'operation', 'registrarCliente')))))
  returning id into v_dp;
  raise notice 'PASS R04: operaciones con servicios destino y objetos de BD';

  begin
    update public.services
       set operations = jsonb_build_array(jsonb_build_object(
             'name', 'registrar',
             'targets', jsonb_build_array(
               jsonb_build_object('service_id', v_backend),
               jsonb_build_object('service_id', v_backend))))
     where id = v_dp;
    raise exception 'FAIL R05: un DataPower aceptó dos destinos en una operación';
  exception when check_violation then
    raise notice 'PASS R05: un DataPower enruta cada operación a un solo servicio';
  end;

  begin
    update public.services
       set operations = jsonb_build_array(jsonb_build_object(
             'name', 'registrar',
             'db_refs', jsonb_build_array(jsonb_build_object('database_id', v_db, 'object', 'X'))))
     where id = v_dp;
    raise exception 'FAIL R06: un DataPower aceptó objetos de BD';
  exception when check_violation then
    raise notice 'PASS R06: un DataPower no ejecuta SP';
  end;

  begin
    update public.services
       set operations = '[{"name": "x", "targets": [{"service_id": "no-es-uuid"}]}]'::jsonb
     where id = v_backend;
    raise exception 'FAIL R07: se aceptó un destino sin UUID';
  exception when check_violation then
    raise notice 'PASS R07: se validan los destinos de las operaciones';
  end;

  -- ===== RPC de relaciones =====
  v_json := public.service_links(v_backend);
  if jsonb_array_length(v_json -> 'exposedBy') <> 1
     or v_json -> 'exposedBy' -> 0 ->> 'operation' <> 'registrar'
     or v_json -> 'exposedBy' -> 0 ->> 'kind' <> 'datapower'
     or v_json -> 'databases' -> v_db::text ->> 'title' <> 'PROMDEV privada' then
    raise exception 'FAIL R08: service_links no devolvió quién lo llama y sus conexiones: %', v_json;
  end if;
  v_json := public.service_links(v_dp);
  if v_json -> 'targets' -> v_backend::text ->> 'title' <> 'Backend clientes' then
    raise exception 'FAIL R08: service_links no resolvió el destino: %', v_json;
  end if;
  raise notice 'PASS R08: service_links (destinos, quién lo llama y conexiones)';

  v_json := public.database_used_by(v_db);
  if jsonb_array_length(v_json) <> 1 or v_json -> 0 ->> 'member' <> 'SP_REGISTRAR_CLIENTE' then
    raise exception 'FAIL R09: database_used_by no devolvió el uso del SP: %', v_json;
  end if;
  raise notice 'PASS R09: database_used_by';

  v_json := public.relations_graph();
  if jsonb_array_length(v_json -> 'services') <> 2 or jsonb_array_length(v_json -> 'databases') <> 2 then
    raise exception 'FAIL R10: relations_graph incompleto: %', v_json;
  end if;
  if exists (select 1 from jsonb_array_elements(v_json -> 'databases') d(item)
             where d.item -> 'objects' -> 0 ? 'code' or d.item ? 'password') then
    raise exception 'FAIL R10: relations_graph expone código o contraseñas';
  end if;
  if (select count(*) from jsonb_array_elements(public.databases_catalog())) <> 2
     or (select count(*) from jsonb_array_elements(public.services_catalog())) <> 2 then
    raise exception 'FAIL R10: catálogos incompletos';
  end if;
  raise notice 'PASS R10: relations_graph y catálogos sin código ni credenciales';

  -- ===== Búsqueda, panel y favoritos =====
  select count(*) into v_n from public.search_resources('SP_REGISTRAR_CLIENTE', array['database']);
  if v_n <> 1 then raise exception 'FAIL R11: la búsqueda no encontró la conexión por su SP'; end if;
  select count(*) into v_n from public.search_resources('secreta', null);
  if v_n <> 0 then raise exception 'FAIL R11: la búsqueda indexó la contraseña'; end if;
  select count(*) into v_n from public.search_resources('DataPower', array['service']);
  if v_n <> 1 then raise exception 'FAIL R11: la búsqueda no encontró el DataPower por su tipo'; end if;
  raise notice 'PASS R11: búsqueda global de conexiones y servicios (sin contraseñas)';

  if (public.dashboard_summary() -> 'counts' -> 'database' ->> 'total')::int <> 2 then
    raise exception 'FAIL R12: el panel no cuenta las conexiones';
  end if;
  insert into public.user_favorites (database_id) values (v_db);
  if (select resource_type from public.user_favorites where database_id = v_db) <> 'database' then
    raise exception 'FAIL R12: el favorito de conexión no tiene tipo database';
  end if;
  raise notice 'PASS R12: panel y favoritos con conexiones';

  -- ===== Carga masiva =====
  v_json := public.bulk_import_apply(
    jsonb_build_array(
      jsonb_build_object('id', v_new_db, 'is_new', true, 'changes', jsonb_build_object(
        'title', 'Conexión importada', 'host', 'imp.qa.test', 'tags', jsonb_build_array('excel'),
        'objects', '[{"type": "procedure", "name": "SP_IMPORTADO"}]'::jsonb)),
      jsonb_build_object('id', v_db, 'is_new', false, 'changes', jsonb_build_object('port', 1522))),
    jsonb_build_array(
      jsonb_build_object('id', v_new_svc, 'is_new', true, 'changes', jsonb_build_object(
        'title', 'Servicio importado', 'base_url', 'https://imp.qa.test',
        'operations', jsonb_build_array(jsonb_build_object(
          'name', 'op', 'targets', jsonb_build_array(jsonb_build_object('service_id', v_backend)),
          'db_refs', jsonb_build_array(jsonb_build_object('database_id', v_new_db, 'object', 'SP_IMPORTADO'))))))));
  if (v_json ->> 'created')::int <> 2 or (v_json ->> 'updated')::int <> 1 then
    raise exception 'FAIL R13: resultado inesperado de la carga masiva: %', v_json;
  end if;
  if (select port from public.databases where id = v_db) <> 1522
     or (select host from public.databases where id = v_db) <> 'db.qa.test' then
    raise exception 'FAIL R13: la actualización parcial tocó columnas no enviadas';
  end if;
  if (select owner_id from public.services where id = v_new_svc) <> v_a then
    raise exception 'FAIL R13: lo importado no quedó a nombre del usuario';
  end if;
  raise notice 'PASS R13: la carga masiva crea y actualiza (solo lo enviado)';

  -- ===== MDI =====
  insert into public.mdi_configs (app, config) values ('SIACPRE_VS13', '{"targetBranch": "develop"}');
  insert into public.mdi_history (app, layer, source_branch, target_branch, proyecto, file_name, payload)
  values ('SIACPRE_VS13', 'front', 'feature/x', 'develop', 'PRY-1', 'MDI.docx', '{"data": {}}');
  raise notice 'PASS R14: configuración e historial del MDI';

  -- ===== B no ve lo privado de A =====
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.databases;
  if v_n <> 1 then raise exception 'FAIL R15: B ve conexiones privadas de A (ve %)', v_n; end if;
  if jsonb_array_length(public.relations_graph() -> 'databases') <> 1 then
    raise exception 'FAIL R15: el grafo de B incluye conexiones privadas de A';
  end if;
  if jsonb_array_length(public.database_used_by(v_db)) <> 0 then
    raise exception 'FAIL R15: B ve el uso de una conexión privada de A';
  end if;
  begin
    perform public.service_links(v_backend);
    raise exception 'FAIL R15: B consultó los enlaces de un servicio privado de A';
  exception when no_data_found then
    null;
  end;
  select count(*) into v_n from public.mdi_configs;
  if v_n <> 0 then raise exception 'FAIL R15: B ve la configuración MDI de A'; end if;
  select count(*) into v_n from public.mdi_history;
  if v_n <> 0 then raise exception 'FAIL R15: B ve el historial MDI de A'; end if;
  raise notice 'PASS R15: B no ve conexiones, relaciones ni MDI privados de A';

  begin
    insert into public.user_favorites (database_id) values (v_db);
    raise exception 'FAIL R16: B marcó como favorita una conexión que no ve';
  exception when insufficient_privilege then
    raise notice 'PASS R16: solo se marcan favoritas las conexiones visibles';
  end;

  -- B intenta, en una carga masiva, crear una conexión y modificar la pública de A:
  -- falla entera y no queda nada a medias.
  begin
    perform public.bulk_import_apply(
      jsonb_build_array(
        jsonb_build_object('id', '00000000-0000-4000-8000-00000000d003', 'is_new', true,
                           'changes', jsonb_build_object('title', 'De B', 'host', 'b.qa.test')),
        jsonb_build_object('id', v_db_pub, 'is_new', false,
                           'changes', jsonb_build_object('notes', 'Editado por B'))),
      '[]'::jsonb);
    raise exception 'FAIL R17: B modificó con la carga masiva una conexión de A';
  exception when insufficient_privilege then
    null;
  end;
  select count(*) into v_n from public.databases where title = 'De B';
  if v_n <> 0 then raise exception 'FAIL R17: la carga masiva fallida dejó datos a medias'; end if;
  raise notice 'PASS R17: la carga masiva respeta el RLS y es atómica';

  -- B no puede escribir columnas fuera de su privilegio (owner_id).
  begin
    insert into public.databases (title, host, owner_id) values ('Suplantación', 'h', v_a);
    raise exception 'FAIL R18: B escribió owner_id';
  exception when insufficient_privilege then
    raise notice 'PASS R18: owner_id no se puede escribir desde la API';
  end;

  execute 'reset role';
end $$;

rollback;
