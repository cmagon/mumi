-- v63: papelera de fichas de producto (borrado seguro con respaldo y restauración).
-- Al eliminar una ficha se guarda un snapshot completo aquí; se puede restaurar o purgar.
create table if not exists productos_papelera (
  id uuid primary key default gen_random_uuid(),
  product_id bigint,          -- id original de products_costing (para restaurar con el mismo id)
  nombre text,
  snapshot jsonb not null,    -- fila completa de products_costing
  eliminado_por text,
  eliminado_at timestamptz not null default now()
);
alter table productos_papelera enable row level security;
drop policy if exists productos_papelera_auth on productos_papelera;
create policy productos_papelera_auth on productos_papelera for all to authenticated using (true) with check (true);
