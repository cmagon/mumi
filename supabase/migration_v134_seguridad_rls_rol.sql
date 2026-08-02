-- ============================================================
-- MUMI AMAZONIA — Migration v134: endurecimiento de seguridad (idempotente)
--
--   1) Helpers de rol reutilizables: is_admin() y has_modulo()
--   2) RLS por rol en finished_products / finished_movements
--      (hoy: "for all to authenticated using (true)" → cualquier usuario con
--       sesión puede vaciar el inventario de producto terminado)
--   3) Token de Alegra: deja de ser legible desde el navegador
--   4) Límite de envío para la Edge Function enviar-correo
--
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Requiere después: supabase functions deploy alegra-items alegra-categories
--   alegra-pricelists alegra-ventas alegra-create-category alegra-push-image
--   alegra-push-stock enviar-correo
-- ============================================================


-- ------------------------------------------------------------
-- 1) Helpers de rol
-- ------------------------------------------------------------

-- ¿El usuario de la sesión es administrador activo?
-- SECURITY DEFINER para no depender de las políticas de lectura de user_profiles
-- (si no, la política se evaluaría a sí misma en cascada).
--
-- "Activo" = estado activo Y no archivado. La pantalla de Usuarios llama
-- "Usuarios Antiguos" a los archivados, o sea gente que ya no trabaja aquí: no
-- deben conservar permisos sobre el inventario.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid()
      and rol = 'admin'
      and coalesce(estado, 'activo') = 'activo'
      and coalesce(archivado, false) = false
  );
$$;

-- ¿El rol del usuario tiene concedido un módulo de la app?
-- Espeja lo que hace el front (src/lib/permisos.js):
--   · admin  → todo
--   · resto  → lo que el admin le haya otorgado en role_permissions.permisos->'modulos'
-- Si el rol no tiene fila en role_permissions se niega, igual que el front, que
-- arranca los roles desconocidos con acceso mínimo.
create or replace function public.has_modulo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when up.rol = 'admin' then true
              else coalesce(rp.permisos -> 'modulos', '[]'::jsonb) ? p_modulo
            end
       from public.user_profiles up
       left join public.role_permissions rp on rp.rol = up.rol
      where up.id = auth.uid()
        and coalesce(up.estado, 'activo') = 'activo'
        and coalesce(up.archivado, false) = false),
    false);
$$;

comment on function public.is_admin() is
  'true si la sesión actual es de un administrador activo. Usado por las políticas RLS.';
comment on function public.has_modulo(text) is
  'true si el rol de la sesión tiene concedido ese módulo en role_permissions (admin siempre).';


-- ------------------------------------------------------------
-- 2) RLS por rol: inventario de producto terminado
-- ------------------------------------------------------------
-- Lectura: cualquier usuario autenticado. La necesitan Tablero, Órdenes de
-- Producción, Registro de Producción y el selector de productos, que solo leen.
--
-- Escritura: solo quien tenga concedido el módulo 'terminados' (Inventario de
-- Producto Terminado) o 'catalogo' (Catálogo público, que marca visibilidad y
-- precios). Por defecto ninguno de los dos está concedido a operario/auxiliar,
-- así que el inventario deja de ser escribible por cualquier sesión.
--
-- La política espeja el permiso de MÓDULO, no el rol admin, porque en la pantalla
-- de Producto Terminado los botones de crear/eliminar/ajustar están detrás del
-- módulo. Exigir admin para el insert/delete dejaría esos botones visibles pero
-- rotos para un operario al que el admin sí le concedió el módulo.
-- Consecuencia práctica: conceder 'terminados' o 'catalogo' es dar control del
-- inventario vendible. Es lo mismo que ya hacía la app, ahora también en la base.

alter table finished_products enable row level security;
alter table finished_movements enable row level security;

drop policy if exists finished_products_auth on finished_products;
drop policy if exists finished_products_select on finished_products;
drop policy if exists finished_products_write on finished_products;

create policy finished_products_select on finished_products
  for select to authenticated using (true);

create policy finished_products_write on finished_products
  for all to authenticated
  using       (public.has_modulo('terminados') or public.has_modulo('catalogo'))
  with check  (public.has_modulo('terminados') or public.has_modulo('catalogo'));

-- Movimientos: son el libro de inventario. Se pueden leer siempre y se escriben
-- junto con el stock. No se actualizan nunca: un movimiento mal registrado se
-- corrige con otro movimiento, no editándolo.
drop policy if exists finished_mov_auth on finished_movements;
drop policy if exists finished_mov_select on finished_movements;
drop policy if exists finished_mov_insert on finished_movements;
drop policy if exists finished_mov_delete on finished_movements;

create policy finished_mov_select on finished_movements
  for select to authenticated using (true);

create policy finished_mov_insert on finished_movements
  for insert to authenticated
  with check (public.has_modulo('terminados') or public.has_modulo('catalogo'));

-- Borrar movimientos solo al devolver una orden de producción, que es acción de
-- admin. Sin esto se podría maquillar el kardex borrando entradas.
create policy finished_mov_delete on finished_movements
  for delete to authenticated using (public.is_admin());


-- ------------------------------------------------------------
-- 3) Token de Alegra fuera del navegador
-- ------------------------------------------------------------
-- La tabla ya era solo-admin, pero el token viajaba en texto plano hasta el
-- navegador cada vez que se abría la pantalla de Alegra. Con esto el token pasa
-- a ser de solo escritura: se puede cambiar, no leer. La app sabe si está
-- configurado mirando token_set, y las Edge Functions lo leen con la service
-- key (que no está sujeta a estos permisos de columna).
--
-- Lo ideal es guardarlo como secreto y dejar la columna vacía:
--   supabase secrets set ALEGRA_EMAIL=... ALEGRA_TOKEN=...
-- Las funciones prefieren el secreto y solo usan la columna como respaldo.

alter table alegra_config
  add column if not exists token_set boolean
  generated always as (token is not null and length(trim(token)) > 0) stored;

comment on column alegra_config.token_set is
  'Solo indica si hay token guardado. La app lee esta bandera; el token en sí no es legible.';

-- En PostgreSQL un GRANT SELECT a nivel de tabla cubre TODAS las columnas y no se
-- anula revocando una sola: hay que quitar el permiso de tabla y volver a darlo
-- columna por columna. Se arma la lista desde el catálogo para no romperse cuando
-- una migración futura agregue columnas a esta tabla.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name  = 'alegra_config'
     and column_name <> 'token';

  execute 'revoke select on public.alegra_config from authenticated, anon';
  execute format('grant select (%s) on public.alegra_config to authenticated', cols);
end $$;

-- La escritura se conserva: el admin necesita poder rotar el token (y la política
-- RLS alegra_config_admin sigue siendo la que limita quién puede hacerlo).
grant insert (token), update (token) on alegra_config to authenticated;


-- ------------------------------------------------------------
-- 4) Límite de envío de correo
-- ------------------------------------------------------------
-- enviar-correo solo exigía sesión válida: cualquier usuario podía usarla como
-- relay para mandar correo ilimitado desde el dominio de la empresa (y quemar la
-- reputación de envío). Se registra cada envío y se corta al pasar el límite.

create table if not exists email_envios (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  destino    text,
  asunto     text,
  created_at timestamptz not null default now()
);

create index if not exists email_envios_user_fecha on email_envios (user_id, created_at desc);

alter table email_envios enable row level security;

-- Nadie lo lee ni lo escribe desde el navegador: es bitácora interna de la
-- Edge Function (service role) y auditoría para el admin.
drop policy if exists email_envios_admin on email_envios;
create policy email_envios_admin on email_envios
  for select to authenticated using (public.is_admin());

-- Registra el envío y devuelve false si el usuario ya pasó su cupo por hora.
-- La cuenta y la inserción van en la misma función para que no haya hueco entre
-- "verifiqué" y "envié".
create or replace function public.registrar_envio_correo(
  p_user_id uuid, p_destino text, p_asunto text, p_max int default 20)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(*) into n
    from public.email_envios
   where user_id = p_user_id
     and created_at > now() - interval '1 hour';

  if n >= p_max then return false; end if;

  insert into public.email_envios (user_id, destino, asunto)
  values (p_user_id, left(coalesce(p_destino, ''), 200), left(coalesce(p_asunto, ''), 300));

  return true;
end $$;

-- PostgreSQL concede EXECUTE a PUBLIC por defecto, así que hay que revocarlo ahí:
-- quitarlo solo de anon/authenticated no serviría de nada. La Edge Function llama
-- con la service key, que es la única que queda con permiso.
revoke all on function public.registrar_envio_correo(uuid, text, text, int) from public;
grant execute on function public.registrar_envio_correo(uuid, text, text, int) to service_role;
