-- ============================================================
-- MUMI AMAZONIA — Migration v182: auditoría de seguridad (idempotente)
--
-- PROBLEMA
--   "authenticated" NO equivale a "personal de confianza":
--     · el alta de usuarios usa signUp con la anon key (pública) → cualquiera puede
--       registrarse y obtener un JWT authenticated;
--     · los invitados externos de Gestión Documental entran por OTP y NO tienen perfil.
--   Aun así ~48 tablas tenían políticas "to authenticated using (true)": empleados,
--   nómina, clientes, producción, inventario, notificaciones… legibles (y varias
--   escribibles) por cualquiera con un JWT.
--
-- QUÉ HACE
--   1) is_staff(): perfil existente, activo y no archivado.
--   2) Reemplaza TODAS las políticas "authenticated + true" de las tablas internas por
--      is_staff() (dinámico sobre pg_policies: no depende de cómo se llamen en producción).
--   3) user_profiles: cada quien lee lo suyo; el personal lee el resto.
--   4) app_settings: escritura solo personal (el invitado solo toca la fila id=2:
--      orden de carpetas compartidas).
--   5) document_shares: cierra la lectura anónima total que v49 reabrió (regresión de v47).
--      El público sigue entrando por token con get_share().
--   6) documentos_editor_invitado: with check igual al using (antes "true").
--   7) Storage: update/delete solo personal; lectura/subida de buckets internos solo personal.
--      (Los invitados solo SUBEN rutas nuevas al bucket 'documentos'; eso se conserva.)
--   8) protect_profile_columns: un no-admin tampoco puede des-archivarse.
--   9) is_catalog_admin(): respeta 'archivado'.
--
-- NO CAMBIA el comportamiento para usuarios con perfil activo.
-- Ejecutar en: Supabase Dashboard → SQL Editor (completo, de una vez).
-- ============================================================


-- ------------------------------------------------------------
-- 1) is_staff()
-- ------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and coalesce(estado, 'activo') = 'activo'
      and coalesce(archivado, false) = false
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

comment on function public.is_staff() is
  'true si la sesión es de un usuario con perfil activo y no archivado. Distingue personal de un JWT authenticated cualquiera (auto-registro / invitado OTP).';


-- ------------------------------------------------------------
-- 2) Políticas "authenticated + true" → is_staff()
--    Solo toca políticas cuyo rol es EXCLUSIVAMENTE authenticated y cuya condición es
--    "true" (o vacía). Respeta las excepciones listadas.
-- ------------------------------------------------------------
do $$
declare
  p record;
  v_using text;
  v_check text;
  -- Excepciones: tablas públicas por diseño, o con política propia más abajo.
  excepciones text[] := array[
    'banners_catalogo', 'config_catalogo', 'frutos_catalogo',   -- catálogo público
    'visitas_catalogo',                                          -- analítica anónima/autenticada (solo insert)
    'documento_versiones',                                       -- el invitado archiva versiones (solo insert/select propio)
    'user_profiles',                                             -- política propia (3)
    'app_settings'                                               -- política propia (4)
  ];
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and roles @> array['authenticated']::name[]
      and not (roles && array['anon', 'public']::name[])
      and coalesce(trim(qual), 'true') = 'true'
      and coalesce(trim(with_check), 'true') = 'true'
      and tablename <> all (excepciones)
  loop
    v_using := case when p.cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL') then ' using (public.is_staff())' else '' end;
    v_check := case when p.cmd in ('INSERT', 'UPDATE', 'ALL') then ' with check (public.is_staff())' else '' end;

    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    execute format('create policy %I on %I.%I for %s to authenticated%s%s',
                   p.policyname, p.schemaname, p.tablename, lower(p.cmd), v_using, v_check);
    raise notice 'endurecida: %.% (%)', p.tablename, p.policyname, p.cmd;
  end loop;
end $$;

-- documento_versiones: el invitado solo INSERTA; leer el historial es del personal.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'documento_versiones' and cmd = 'SELECT'
      and roles @> array['authenticated']::name[] and coalesce(trim(qual), 'true') = 'true'
  loop
    execute format('drop policy if exists %I on public.documento_versiones', p.policyname);
    execute format('create policy %I on public.documento_versiones for select to authenticated using (public.is_staff())', p.policyname);
  end loop;
end $$;


-- ------------------------------------------------------------
-- 3) user_profiles: lo propio, o todo si eres personal
--    (Se mantiene legible el propio perfil para que el login pueda mostrar "usuario inactivo".)
-- ------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and cmd = 'SELECT'
      and roles @> array['authenticated']::name[] and coalesce(trim(qual), 'true') = 'true'
  loop
    execute format('drop policy if exists %I on public.user_profiles', p.policyname);
  end loop;
end $$;

drop policy if exists user_profiles_select_staff on public.user_profiles;
create policy user_profiles_select_staff on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());


-- ------------------------------------------------------------
-- 4) app_settings: lectura pública (logo/nombre en la vista compartida), escritura solo personal.
--    El invitado externo únicamente persiste el orden de carpetas (fila id = 2).
-- ------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.app_settings', p.policyname);
  end loop;
end $$;

create policy app_settings_write on public.app_settings
  for all to authenticated
  using (public.is_staff() or id = 2)
  with check (public.is_staff() or id = 2);


-- ------------------------------------------------------------
-- 5) document_shares: cerrar la lectura anónima total (regresión v49 sobre v47)
-- ------------------------------------------------------------
drop policy if exists document_shares_read on public.document_shares;
drop policy if exists document_shares_auth_read on public.document_shares;
create policy document_shares_auth_read on public.document_shares
  for select to authenticated using (public.is_staff());

-- El invitado externo (OTP, sin perfil) lee SOLO sus propias comparticiones. Lo necesitan las
-- políticas de documentos (select/update de invitado), que consultan document_shares con
-- los permisos del propio invitado.
drop policy if exists document_shares_guest_read on public.document_shares;
create policy document_shares_guest_read on public.document_shares
  for select to authenticated
  using (
    coalesce(auth.jwt() ->> 'email', '') <> ''
    and lower(coalesce(email_invitado, '')) = lower(auth.jwt() ->> 'email')
  );

-- El público/invitado entra SOLO por token (no puede listar comparticiones).
create or replace function public.get_share(p_token uuid)
returns setof document_shares
language sql security definer stable
set search_path = public
as $$
  select * from public.document_shares where token = p_token;
$$;
revoke all on function public.get_share(uuid) from public;
grant execute on function public.get_share(uuid) to anon, authenticated;


-- ------------------------------------------------------------
-- 6) documentos_editor_invitado: with check = using (antes "true": permitía mover/alterar
--    el documento fuera de la carpeta compartida)
-- ------------------------------------------------------------
drop policy if exists documentos_editor_invitado on public.documentos;
create policy documentos_editor_invitado on public.documentos for update to authenticated
using (exists (
  select 1 from public.document_shares s
  where s.permiso = 'edicion'
    and lower(s.email_invitado) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (s.expira_at is null or s.expira_at > now())
    and (coalesce(s.carpeta, '') = '' or proceso = s.carpeta or proceso like s.carpeta || '/%')
))
with check (exists (
  select 1 from public.document_shares s
  where s.permiso = 'edicion'
    and lower(s.email_invitado) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (s.expira_at is null or s.expira_at > now())
    and (coalesce(s.carpeta, '') = '' or proceso = s.carpeta or proceso like s.carpeta || '/%')
));


-- ------------------------------------------------------------
-- 7) Storage
--    · documentos: el invitado puede SUBIR (rutas nuevas) y leer; solo el personal
--      sobrescribe o borra archivos.
--    · buckets internos: solo personal.
-- ------------------------------------------------------------
drop policy if exists documentos_obj_update on storage.objects;
create policy documentos_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.is_staff())
  with check (bucket_id = 'documentos' and public.is_staff());

drop policy if exists documentos_obj_delete on storage.objects;
create policy documentos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.is_staff());

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('Auth read product-images',        'select', 'product-images'),
      ('Auth upload product-images',      'insert', 'product-images'),
      ('Auth read ficha-imprimibles',     'select', 'ficha-imprimibles'),
      ('Auth upload ficha-imprimibles',   'insert', 'ficha-imprimibles'),
      ('Auth delete ficha-imprimibles',   'delete', 'ficha-imprimibles'),
      ('Authenticated upload production', 'insert', 'production-photos'),
      ('Authenticated read production',   'select', 'production-photos'),
      ('Authenticated upload gallery',    'insert', 'gallery'),
      ('Authenticated read gallery',      'select', 'gallery'),
      ('Authenticated upload recipes',    'insert', 'recipe-images'),
      ('Authenticated read recipes',      'select', 'recipe-images'),
      ('Authenticated upload sheets',     'insert', 'technical-sheets'),
      ('Authenticated read sheets',       'select', 'technical-sheets')
    ) as t(nombre, cmd, bucket)
  loop
    -- Solo si la política existe en este proyecto (no inventa las que no hay).
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = r.nombre) then
      execute format('drop policy if exists %I on storage.objects', r.nombre);
      if r.cmd = 'insert' then
        execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and public.is_staff())', r.nombre, r.bucket);
      else
        execute format('create policy %I on storage.objects for %s to authenticated using (bucket_id = %L and public.is_staff())', r.nombre, r.cmd, r.bucket);
      end if;
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
-- 8) protect_profile_columns: también 'archivado' (un usuario archivado no debe poder
--    des-archivarse). Se lee con to_jsonb para no depender de que la columna exista.
-- ------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  -- Los admin pueden cambiar todo (política "Admin write").
  if public.get_my_role() = 'admin' then
    return new;
  end if;
  if new.rol             is distinct from old.rol
     or new.estado       is distinct from old.estado
     or new.login        is distinct from old.login
     or new.id           is distinct from old.id
     or new.es_desarrollador is distinct from old.es_desarrollador
     or (to_jsonb(new) -> 'archivado') is distinct from (to_jsonb(old) -> 'archivado') then
    raise exception 'No autorizado a modificar rol/estado/login/archivado/es_desarrollador';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile on public.user_profiles;
create trigger trg_protect_profile
  before update on public.user_profiles
  for each row execute function public.protect_profile_columns();


-- ------------------------------------------------------------
-- 9) is_catalog_admin(): un admin archivado ya no administra el catálogo
-- ------------------------------------------------------------
create or replace function public.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and rol = 'admin'
      and coalesce(estado, 'activo') = 'activo'
      and coalesce(archivado, false) = false
  );
$$;
revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;


-- ------------------------------------------------------------
-- Verificación rápida (debe devolver 0 filas):
--   políticas que siguen abiertas a cualquier JWT authenticated.
-- ------------------------------------------------------------
-- select tablename, policyname, cmd
--   from pg_policies
--  where schemaname = 'public'
--    and roles @> array['authenticated']::name[]
--    and not (roles && array['anon','public']::name[])
--    and coalesce(trim(qual),'true') = 'true'
--    and coalesce(trim(with_check),'true') = 'true'
--    and tablename not in ('banners_catalogo','config_catalogo','frutos_catalogo','visitas_catalogo','documento_versiones');
