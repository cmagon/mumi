-- v132 — Baja de lotes PEPS de materia prima (vencidos, dañados, etc.).
--
-- Cuando un lote se vence o se daña, el operario lo da de baja indicando el motivo. Queda el
-- registro para auditoría y se descuenta la cantidad del lote y del stock general de la MP.
create table if not exists lote_bajas (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid,                         -- raw_material_lots.id (puede quedar huérfano si se borra el lote)
  mp_id bigint,                         -- raw_materials.id
  mp_nombre text,
  lote text,
  cantidad numeric not null default 0,  -- cantidad dada de baja, en la unidad de la MP
  unidad text,
  motivo text not null,                 -- vencido | dañado | contaminado | otro (+ texto libre)
  vencimiento date,
  creado_por text,
  created_at timestamptz not null default now()
);
alter table lote_bajas enable row level security;
drop policy if exists lote_bajas_auth on lote_bajas;
create policy lote_bajas_auth on lote_bajas for all to authenticated using (true) with check (true);
