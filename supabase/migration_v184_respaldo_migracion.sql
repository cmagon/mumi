-- ============================================================
-- MUMI AMAZONIA — Migration v184: respaldo y migración de la base de datos
--
-- Funciones SOLO PARA ADMINISTRADORES que usa la pantalla Configuración → «Respaldo y migración»:
--   respaldo_catalogo()          estructura COMPLETA de la base (tablas, columnas, restricciones, índices,
--                                funciones, triggers, políticas RLS, buckets) para regenerar el esquema
--   respaldo_leer(tabla,…)       lee filas de una tabla por páginas, sin depender de RLS ni de permisos
--                                por columna (así el respaldo siempre sale completo)
--   respaldo_importar(tabla,…)   inserta filas JSON en una tabla (con tolerancia a errores por fila)
--   respaldo_ajustar_secuencias()  deja los contadores (serial/identity) después del mayor id importado
--   respaldo_archivos(bucket)    lista los archivos de un bucket de Storage
--
-- Todas validan is_admin() (v134). No exponen nada a anon.
-- Ejecutar en: Supabase Dashboard → SQL Editor (completo).
-- ============================================================

create or replace function public.respaldo_exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1) Catálogo de la base
-- ------------------------------------------------------------
create or replace function public.respaldo_catalogo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  r jsonb;
begin
  perform public.respaldo_exigir_admin();

  select jsonb_build_object(
    'version', 1,
    'generado', now(),
    'servidor', current_setting('server_version'),

    -- Extensiones (el esquema generado las pide solo si existen en el proyecto de origen)
    'extensiones', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', e.extname, 'esquema', n.nspname) order by e.extname)
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
      where e.extname not in ('plpgsql')
    ), '[]'::jsonb),

    -- Tipos enumerados
    'tipos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', t.typname,
        'valores', (select jsonb_agg(en.enumlabel order by en.enumsortorder) from pg_enum en where en.enumtypid = t.oid)
      ) order by t.typname)
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typtype = 'e'
        and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
    ), '[]'::jsonb),

    -- Secuencias independientes (las de serial/identity se crean con su columna)
    'secuencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', c.relname,
        'tipo', format_type(s.seqtypid, null),
        -- como texto: un bigint máximo (9223372036854775807) pierde precisión al pasar por JSON de JavaScript
        'inicio', s.seqstart::text, 'incremento', s.seqincrement::text, 'minimo', s.seqmin::text, 'maximo', s.seqmax::text, 'ciclo', s.seqcycle,
        'tabla', dt.relname, 'columna', a.attname
      ) order by c.relname)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_sequence s on s.seqrelid = c.oid
      left join pg_depend d on d.objid = c.oid and d.deptype in ('a', 'i') and d.refclassid = 'pg_class'::regclass
      left join pg_class dt on dt.oid = d.refobjid
      left join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
      where n.nspname = 'public' and c.relkind = 'S'
        and not exists (select 1 from pg_depend x where x.objid = c.oid and x.deptype = 'e')
        and coalesce(d.deptype, 'a') <> 'i'                   -- las de identity las crea la propia columna
    ), '[]'::jsonb),

    -- Tablas
    'tablas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', c.relname,
        'rls', c.relrowsecurity,
        'rls_forzado', c.relforcerowsecurity,
        'comentario', obj_description(c.oid, 'pg_class'),
        'columnas', (
          select jsonb_agg(jsonb_build_object(
            'nombre', a.attname,
            'tipo', format_type(a.atttypid, a.atttypmod),
            'no_nulo', a.attnotnull,
            'defecto', case when a.attgenerated = '' and a.attidentity = '' then pg_get_expr(ad.adbin, ad.adrelid) end,
            'generada', case when a.attgenerated <> '' then pg_get_expr(ad.adbin, ad.adrelid) end,
            'identidad', nullif(a.attidentity::text, '')
          ) order by a.attnum)
          from pg_attribute a
          left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        ),
        'restricciones', coalesce((
          select jsonb_agg(jsonb_build_object(
            'nombre', k.conname, 'tipo', k.contype::text,
            'def', pg_get_constraintdef(k.oid, true),
            'ref_tabla', case when k.contype = 'f' then fr.relname end
          ) order by case k.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, k.conname)
          from pg_constraint k
          left join pg_class fr on fr.oid = k.confrelid
          where k.conrelid = c.oid and k.contype in ('p', 'u', 'c', 'f', 'x')
        ), '[]'::jsonb),
        'indices', coalesce((
          select jsonb_agg(jsonb_build_object('nombre', ic.relname, 'def', pg_get_indexdef(i.indexrelid)) order by ic.relname)
          from pg_index i join pg_class ic on ic.oid = i.indexrelid
          where i.indrelid = c.oid
            and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)   -- los de PK/UNIQUE ya van con su restricción
        ), '[]'::jsonb),
        'triggers', coalesce((
          select jsonb_agg(jsonb_build_object('nombre', tg.tgname, 'def', pg_get_triggerdef(tg.oid)) order by tg.tgname)
          from pg_trigger tg
          where tg.tgrelid = c.oid and not tg.tgisinternal
        ), '[]'::jsonb),
        'pk', coalesce((
          select jsonb_agg(a.attname order by array_position(k.conkey, a.attnum))
          from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
          where k.conrelid = c.oid and k.contype = 'p'
        ), '[]'::jsonb),
        -- Permisos (solo se reproducen si la tabla tiene permisos explícitos)
        'acl_definida', c.relacl is not null,
        'acl', coalesce((
          select jsonb_agg(jsonb_build_object('rol', q.rol, 'priv', q.privs))
          from (select case when x.grantee = 0 then 'public' else pg_get_userbyid(x.grantee) end as rol, to_jsonb(array_agg(x.privilege_type order by x.privilege_type)) as privs
                from aclexplode(c.relacl) x where x.grantee <> c.relowner group by 1) q
          where q.rol in ('public', 'anon', 'authenticated', 'service_role')
        ), '[]'::jsonb),
        'acl_cols', coalesce((
          select jsonb_agg(jsonb_build_object('col', q.col, 'rol', q.rol, 'priv', q.privs))
          from (select a.attname as col, case when x.grantee = 0 then 'public' else pg_get_userbyid(x.grantee) end as rol, to_jsonb(array_agg(x.privilege_type order by x.privilege_type)) as privs
                from pg_attribute a, lateral aclexplode(a.attacl) x
                where a.attrelid = c.oid and a.attacl is not null and x.grantee <> c.relowner
                group by a.attname, 2) q
          where q.rol in ('public', 'anon', 'authenticated', 'service_role')
        ), '[]'::jsonb)
      ) order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    ), '[]'::jsonb),

    -- Vistas
    'vistas', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', c.relname, 'def', pg_get_viewdef(c.oid, true), 'materializada', c.relkind = 'm',
        'acl_definida', c.relacl is not null,
        'acl', coalesce((select jsonb_agg(jsonb_build_object('rol', q.rol, 'priv', q.privs))
                from (select case when x.grantee = 0 then 'public' else pg_get_userbyid(x.grantee) end as rol, to_jsonb(array_agg(x.privilege_type order by x.privilege_type)) as privs
                      from aclexplode(c.relacl) x where x.grantee <> c.relowner group by 1) q
                where q.rol in ('public', 'anon', 'authenticated', 'service_role')), '[]'::jsonb)) order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v', 'm')
        and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    ), '[]'::jsonb),

    -- Funciones propias (sin las de extensiones)
    'funciones', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'def', pg_get_functiondef(p.oid),
        'acl_definida', p.proacl is not null,
        'acl', coalesce((select jsonb_agg(jsonb_build_object('rol', q.rol, 'priv', q.privs))
                from (select case when x.grantee = 0 then 'public' else pg_get_userbyid(x.grantee) end as rol, to_jsonb(array_agg(x.privilege_type order by x.privilege_type)) as privs
                      from aclexplode(p.proacl) x where x.grantee <> p.proowner group by 1) q
                where q.rol in ('public', 'anon', 'authenticated', 'service_role')), '[]'::jsonb)) order by p.proname, p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind in ('f', 'p')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    ), '[]'::jsonb),

    -- Políticas de seguridad por fila (RLS)
    'politicas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'esquema', pl.schemaname, 'tabla', pl.tablename, 'nombre', pl.policyname,
        'permisiva', pl.permissive, 'cmd', pl.cmd, 'roles', to_jsonb(pl.roles),
        'usando', pl.qual, 'con_check', pl.with_check
      ) order by pl.schemaname, pl.tablename, pl.policyname)
      from pg_policies pl
      where pl.schemaname in ('public', 'storage')
        and (pl.schemaname = 'public' or pl.tablename = 'objects')
    ), '[]'::jsonb),

    -- Storage: buckets
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'nombre', b.name, 'publico', b.public,
        'limite', b.file_size_limit, 'mime', to_jsonb(b.allowed_mime_types)
      ) order by b.id)
      from storage.buckets b
    ), '[]'::jsonb)
  ) into r;

  -- Conteo exacto de filas por tabla
  r := jsonb_set(r, '{filas}', coalesce((
    select jsonb_object_agg(t->>'nombre', (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t->>'nombre'), false, true, '')))[1]::text::bigint)
    from jsonb_array_elements(r->'tablas') t
  ), '{}'::jsonb));

  return r;
end $$;

-- ------------------------------------------------------------
-- 2) Leer filas de una tabla (por páginas)
-- ------------------------------------------------------------
create or replace function public.respaldo_leer(p_tabla text, p_desde int default 0, p_limite int default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_orden text;
  r jsonb;
begin
  perform public.respaldo_exigir_admin();
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_tabla) then
    raise exception 'La tabla % no existe', p_tabla;
  end if;
  p_limite := least(greatest(coalesce(p_limite, 500), 1), 2000);
  p_desde := greatest(coalesce(p_desde, 0), 0);
  -- Orden estable: por la llave primaria; si no hay, por ctid
  select string_agg(quote_ident(a.attname), ', ' order by array_position(k.conkey, a.attnum)) into v_orden
  from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
  where k.conrelid = ('public.' || quote_ident(p_tabla))::regclass and k.contype = 'p';
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I order by %s offset %s limit %s) t',
                 p_tabla, coalesce(v_orden, 'ctid'), p_desde, p_limite) into r;
  return r;
end $$;

-- ------------------------------------------------------------
-- 3) Importar filas JSON en una tabla
--    p_modo: 'omitir' (no toca filas que ya existen) · 'reemplazar' (actualiza por llave primaria)
-- ------------------------------------------------------------
create or replace function public.respaldo_importar(p_tabla text, p_filas jsonb, p_modo text default 'omitir')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_tabla regclass;
  v_cols text;
  v_pk text;
  v_set text;
  v_conflicto text;
  v_sql text;
  v_n int := 0;
  v_ok int := 0;
  v_err int := 0;
  v_msgs jsonb := '[]'::jsonb;
  v_fila jsonb;
  v_aux int;
begin
  perform public.respaldo_exigir_admin();
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = p_tabla) then
    raise exception 'La tabla % no existe en el destino', p_tabla;
  end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'p_filas debe ser un arreglo JSON'; end if;
  if p_modo not in ('omitir', 'reemplazar') then raise exception 'Modo inválido: %', p_modo; end if;
  v_tabla := ('public.' || quote_ident(p_tabla))::regclass;

  -- Columnas a insertar: las que existen en el destino (sin generadas) Y vienen en los datos.
  -- Las que no vienen quedan con su valor por defecto (jsonb_populate_recordset pondría NULL).
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
  from pg_attribute a
  where a.attrelid = v_tabla and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and exists (select 1 from jsonb_array_elements(p_filas) e where jsonb_typeof(e) = 'object' and e ? a.attname);
  if v_cols is null then
    return jsonb_build_object('recibidas', jsonb_array_length(p_filas), 'insertadas', 0, 'omitidas', jsonb_array_length(p_filas), 'errores', 0, 'mensajes', '[]'::jsonb);
  end if;

  select string_agg(quote_ident(a.attname), ', ' order by array_position(k.conkey, a.attnum)) into v_pk
  from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
  where k.conrelid = v_tabla and k.contype = 'p';

  if p_modo = 'reemplazar' and v_pk is not null then
    select string_agg(format('%1$s = excluded.%1$s', quote_ident(attname)), ', ') into v_set
    from pg_attribute where attrelid = v_tabla and attnum > 0 and not attisdropped and attgenerated = ''
      and exists (select 1 from jsonb_array_elements(p_filas) e where jsonb_typeof(e) = 'object' and e ? attname)
      and attname not in (select a.attname from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey) where k.conrelid = v_tabla and k.contype = 'p');
    v_conflicto := case when v_set is null then 'on conflict do nothing' else format('on conflict (%s) do update set %s', v_pk, v_set) end;
  else
    v_conflicto := 'on conflict do nothing';
  end if;

  v_sql := format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1) %s',
                  p_tabla, v_cols, v_cols, p_tabla, v_conflicto);
  v_n := jsonb_array_length(p_filas);

  -- Intento en bloque
  begin
    -- Si el rol lo permite, evita disparar triggers y validar FK durante la carga (se ignora si no)
    begin perform set_config('session_replication_role', 'replica', true); exception when others then null; end;
    execute v_sql using p_filas;
    get diagnostics v_ok = row_count;
  exception when others then
    -- Algún registro falla: se reintenta fila por fila para no perder las buenas
    v_ok := 0;
    for v_fila in select * from jsonb_array_elements(p_filas) loop
      begin
        execute v_sql using jsonb_build_array(v_fila);
        get diagnostics v_aux = row_count;
        v_ok := v_ok + v_aux;
      exception when others then
        v_err := v_err + 1;
        if jsonb_array_length(v_msgs) < 5 then v_msgs := v_msgs || to_jsonb(sqlerrm); end if;
      end;
    end loop;
  end;

  return jsonb_build_object('recibidas', v_n, 'insertadas', v_ok, 'omitidas', greatest(v_n - v_ok - v_err, 0), 'errores', v_err, 'mensajes', v_msgs);
end $$;

-- ------------------------------------------------------------
-- 4) Reajustar contadores (serial / identity) tras importar
-- ------------------------------------------------------------
create or replace function public.respaldo_ajustar_secuencias()
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  c record;
  v_seq text;
  v_max numeric;
  v_n int := 0;
begin
  perform public.respaldo_exigir_admin();
  for c in
    select cl.relname as tabla, a.attname as col
    from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and cl.relkind in ('r', 'p')
  loop
    v_seq := pg_get_serial_sequence(format('public.%I', c.tabla), c.col);
    if v_seq is null then continue; end if;
    execute format('select max(%I) from public.%I', c.col, c.tabla) into v_max;
    if v_max is null then continue; end if;
    perform setval(v_seq::regclass, greatest(v_max, 1)::bigint, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ------------------------------------------------------------
-- 5) Archivos de un bucket de Storage
-- ------------------------------------------------------------
create or replace function public.respaldo_archivos(p_bucket text, p_desde int default 0, p_limite int default 1000)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare r jsonb;
begin
  perform public.respaldo_exigir_admin();
  select coalesce(jsonb_agg(jsonb_build_object('nombre', o.name, 'tamano', (o.metadata->>'size')::bigint, 'tipo', o.metadata->>'mimetype') order by o.name), '[]'::jsonb) into r
  from (select name, metadata from storage.objects where bucket_id = p_bucket and name not like '%/.emptyFolderPlaceholder' order by name offset greatest(p_desde, 0) limit least(greatest(p_limite, 1), 5000)) o;
  return r;
end $$;

-- Permisos: solo usuarios autenticados pueden llamarlas (y cada una exige is_admin())
revoke all on function public.respaldo_exigir_admin() from public;
revoke all on function public.respaldo_catalogo() from public;
revoke all on function public.respaldo_leer(text, int, int) from public;
revoke all on function public.respaldo_importar(text, jsonb, text) from public;
revoke all on function public.respaldo_ajustar_secuencias() from public;
revoke all on function public.respaldo_archivos(text, int, int) from public;
grant execute on function public.respaldo_catalogo() to authenticated;
grant execute on function public.respaldo_leer(text, int, int) to authenticated;
grant execute on function public.respaldo_importar(text, jsonb, text) to authenticated;
grant execute on function public.respaldo_ajustar_secuencias() to authenticated;
grant execute on function public.respaldo_archivos(text, int, int) to authenticated;
