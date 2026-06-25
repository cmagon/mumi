-- v59: inventario de PRODUCTO TERMINADO + enlace con Alegra
-- La app es la fuente de verdad del inventario: la producción aprobada SUMA stock terminado
-- y la facturación en Alegra (vía webhook) lo DESCUENTA.

-- Catálogo de productos: código SKU (puente con Alegra) y stock de producto terminado
alter table products_costing add column if not exists sku text;
alter table products_costing add column if not exists stock_terminado numeric not null default 0;
-- (opcional) id del ítem en Alegra para empujar ajustes en sentido app -> Alegra
alter table products_costing add column if not exists alegra_item_id text;

-- Movimientos de inventario de producto terminado (kardex)
create table if not exists finished_movements (
  id uuid primary key default gen_random_uuid(),
  product_id bigint references products_costing(id) on delete set null,
  tipo text not null,                  -- entrada | salida | ajuste
  cantidad numeric not null default 0,
  lote text,
  fecha date not null default current_date,
  origen text,                         -- produccion | alegra | manual
  ref text,                            -- id de orden / id de factura Alegra
  obs text,
  creado_por text,
  created_at timestamptz not null default now()
);
alter table finished_movements enable row level security;
drop policy if exists finished_mov_auth on finished_movements;
create policy finished_mov_auth on finished_movements for all to authenticated using (true) with check (true);
-- El webhook (service role) ya pasa por encima de RLS; esta policy es para la app.

-- Idempotencia de facturas Alegra: evita descontar dos veces el mismo evento
create table if not exists alegra_eventos (
  id text primary key,                 -- id de la factura/evento de Alegra
  tipo text,
  payload jsonb,
  procesado_at timestamptz not null default now()
);
alter table alegra_eventos enable row level security;
drop policy if exists alegra_eventos_auth on alegra_eventos;
create policy alegra_eventos_auth on alegra_eventos for select to authenticated using (true);
