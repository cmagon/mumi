-- v57: saldos de mezcla en proceso (sobrante de producción no empacado, se empaca después)
create table if not exists mezcla_saldos (
  id uuid primary key default gen_random_uuid(),
  producto text not null,
  origen_id bigint,                       -- products_costing id (opcional)
  lote text,                              -- lote de la mezcla original (manda la trazabilidad)
  vencimiento date,                       -- vencimiento heredado de la mezcla
  peso numeric not null default 0,        -- peso disponible del saldo
  unidad text not null default 'g',       -- 'g' | 'Kg'
  orden_origen bigint,                    -- orden que generó el saldo (production_orders.id)
  estado text not null default 'disponible',  -- disponible | agotado
  creado_por text,
  created_at timestamptz not null default now()
);
alter table mezcla_saldos enable row level security;
drop policy if exists mezcla_saldos_all on mezcla_saldos;
create policy mezcla_saldos_all on mezcla_saldos for all to authenticated using (true) with check (true);
