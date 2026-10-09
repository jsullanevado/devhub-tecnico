-- =============================================================================
-- DevHub Técnico · Resumen del panel de inicio
-- -----------------------------------------------------------------------------
-- public.dashboard_summary(): una sola llamada con contadores, recientes,
-- lecciones abiertas, manuales más descargados, etiquetas más usadas y uso de
-- Storage. SECURITY INVOKER: cada consulta pasa por el RLS de su tabla, así que
-- solo cuenta lo que el usuario puede ver (públicos + propios).
-- La única excepción es el total de bytes del bucket (cifra agregada, sin nombres
-- ni rutas), que necesita SECURITY DEFINER y vive en el esquema privado.
-- Idempotente. Se ejecuta en una única transacción.
-- =============================================================================

begin;

-- 1. Bytes ocupados en el bucket (todos los usuarios): para vigilar la cuota del plan.
create or replace function private.storage_used_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'devhub-documents';
$$;

revoke all on function private.storage_used_bytes() from public, anon, authenticated;
grant execute on function private.storage_used_bytes() to authenticated;

-- 2. Resumen del panel.
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
