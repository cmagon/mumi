-- v107 — Endurecimiento de credenciales y permisos del catálogo.
-- Ejecutar después de las migraciones v95–v106.

-- Supabase Auth ya almacena los hashes de contraseña. No se debe conservar una segunda
-- copia recuperable en la base de datos ni en el navegador.
drop table if exists user_secrets;
alter table user_profiles drop column if exists password_visible;

-- Predicado centralizado para políticas administrativas del catálogo.
create or replace function public.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and rol = 'admin' and coalesce(estado, 'activo') = 'activo'
  );
$$;

revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;

-- Configuración: pública solo para lectura; escritura exclusivamente administrativa.
drop policy if exists catalogo_config_admin on config_catalogo;
create policy catalogo_config_admin on config_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

-- Métricas: el público registra visitas, únicamente los administradores las consultan o administran.
drop policy if exists catalogo_visitas_admin on visitas_catalogo;
create policy catalogo_visitas_admin on visitas_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

-- Pedidos y suscriptores contienen datos comerciales/personales.
drop policy if exists catalogo_pedidos_admin on pedidos_catalogo;
create policy catalogo_pedidos_admin on pedidos_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

drop policy if exists suscriptores_admin on suscriptores_catalogo;
create policy suscriptores_admin on suscriptores_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

drop policy if exists mensajes_admin on mensajes_catalogo;
create policy mensajes_admin on mensajes_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

-- Frutos y banners: lectura pública permitida; su administración exige rol admin.
drop policy if exists frutos_admin on frutos_catalogo;
create policy frutos_admin on frutos_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

drop policy if exists banners_admin on banners_catalogo;
create policy banners_admin on banners_catalogo for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

-- Controles básicos contra inserciones anónimas malformadas. Para límites por IP o CAPTCHA,
-- enrutar estas inserciones mediante una Edge Function con rate limiting.
alter table suscriptores_catalogo
  add constraint suscriptores_email_format check (
    char_length(email) between 3 and 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  ) not valid;
alter table mensajes_catalogo
  add constraint mensajes_catalogo_length check (char_length(mensaje) between 1 and 5000) not valid;
