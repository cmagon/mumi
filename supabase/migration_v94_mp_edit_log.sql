-- v94 — Auditoría de EDICIONES de materias primas: cada vez que un usuario edita la ficha
-- de una MP (nombre, precio, unidad, stock, etc.) se registra QUÉ cambió, QUIÉN y CUÁNDO.
create table if not exists mp_edit_log (
  id bigint generated always as identity primary key,
  mp_id bigint references raw_materials(id) on delete cascade,
  cambios jsonb not null default '[]'::jsonb,   -- [{ campo, antes, despues }]
  editado_por text,
  created_at timestamptz not null default now()
);
create index if not exists idx_mp_edit_log_mp on mp_edit_log (mp_id, created_at desc);

alter table mp_edit_log enable row level security;
drop policy if exists mp_edit_log_select on mp_edit_log;
create policy mp_edit_log_select on mp_edit_log for select to authenticated using (true);
drop policy if exists mp_edit_log_insert on mp_edit_log;
create policy mp_edit_log_insert on mp_edit_log for insert to authenticated with check (true);
