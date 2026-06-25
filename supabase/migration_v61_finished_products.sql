-- v61: catálogo de PRODUCTOS TERMINADOS (fuente de verdad del stock vendible y del nombre).
-- Incluye productos base (vienen de las fichas) y surtidos (combinaciones de sabores).
-- El stock se gestiona desde su módulo y se sincroniza con Alegra.

create table if not exists finished_products (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  sku text,
  alegra_item_id text,
  tipo text not null default 'base',     -- base | surtido
  product_id bigint,                     -- ficha base (products_costing.id), opcional
  stock numeric not null default 0,
  stock_min numeric default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table finished_products enable row level security;
drop policy if exists finished_products_auth on finished_products;
create policy finished_products_auth on finished_products for all to authenticated using (true) with check (true);

-- El kardex ahora referencia el catálogo de terminados
alter table finished_movements add column if not exists finished_id uuid references finished_products(id) on delete set null;

-- Bootstrap: crea un producto terminado por cada ficha base existente (no subproductos)
insert into finished_products (nombre, sku, alegra_item_id, tipo, product_id, stock, activo)
select nombre, sku, alegra_item_id, 'base', id, coalesce(stock_terminado, 0), coalesce(activo, true)
from products_costing
where coalesce(tipo, '') <> 'subproducto'
on conflict (nombre) do nothing;
