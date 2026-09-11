-- v171 — Los clientes con sesión (rol authenticated) deben poder LEER el catálogo público
-- igual que un visitante anónimo. Con las cuentas de cliente (v168) el catálogo mantiene
-- sesión; al iniciarla, las lecturas pasan a hacerse como `authenticated`, rol que NO tenía
-- permiso sobre la vista de productos ni políticas de lectura en config/banners/frutos.
-- Síntoma: un cliente logueado ve el diseño por defecto y SIN productos.

-- 1) Vista de productos: permitir SELECT también a authenticated (ya lo tenía anon).
grant select on catalogo_productos to authenticated;

-- 2) Config, banners y frutos: lectura pública también para authenticated.
--    (Las políticas RLS combinan con OR, así que el acceso admin por is_catalog_admin() se conserva.)
drop policy if exists catalogo_config_read_auth on config_catalogo;
create policy catalogo_config_read_auth on config_catalogo
  for select to authenticated using (true);

drop policy if exists frutos_read_auth on frutos_catalogo;
create policy frutos_read_auth on frutos_catalogo
  for select to authenticated using (true);

drop policy if exists banners_read_auth on banners_catalogo;
create policy banners_read_auth on banners_catalogo
  for select to authenticated using (true);

-- 3) Métricas: permitir que un cliente con sesión registre visitas (como el anónimo).
drop policy if exists catalogo_visitas_insert_auth on visitas_catalogo;
create policy catalogo_visitas_insert_auth on visitas_catalogo
  for insert to authenticated with check (true);
