-- v97 — Permisos del ADMIN (rol authenticated) sobre las tablas del catálogo.
-- Faltaba: el catálogo solo tenía políticas para el público (anon). El sistema principal
-- (usuarios autenticados) necesita leer/escribir config y leer métricas/pedidos.

-- Config: el admin puede leer y escribir (guardar configuración, URL, etc.)
drop policy if exists catalogo_config_admin on config_catalogo;
create policy catalogo_config_admin on config_catalogo for all to authenticated using (true) with check (true);

-- Métricas: el admin puede LEER las visitas
drop policy if exists catalogo_visitas_admin on visitas_catalogo;
create policy catalogo_visitas_admin on visitas_catalogo for select to authenticated using (true);

-- Pedidos: el admin puede leer y actualizar el estado (iniciado → confirmado → entregado)
drop policy if exists catalogo_pedidos_admin on pedidos_catalogo;
create policy catalogo_pedidos_admin on pedidos_catalogo for all to authenticated using (true) with check (true);

-- Nota: finished_products (donde viven los campos catalogo_*) ya tiene políticas para
-- 'authenticated', por eso publicar productos desde el admin ya funciona.
