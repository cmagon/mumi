-- v72: registro de bajas (descartes) de productos por empacar / saldos de mezcla.
create table if not exists saldo_bajas (
  id uuid primary key default gen_random_uuid(),
  saldo_id uuid,
  producto text,
  lote text,
  cantidad numeric not null default 0,
  unidad text,
  motivo text,
  creado_por text,
  created_at timestamptz not null default now()
);
alter table saldo_bajas enable row level security;
drop policy if exists saldo_bajas_auth on saldo_bajas;
create policy saldo_bajas_auth on saldo_bajas for all to authenticated using (true) with check (true);
