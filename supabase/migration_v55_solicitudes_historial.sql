-- v55: solicitudes de más tiempo + historial de cambios del invitado

-- Solicitudes del invitado para ampliar la vigencia del enlace
create table if not exists share_solicitudes (
  id uuid primary key default gen_random_uuid(),
  token uuid,
  email text,
  created_at timestamptz not null default now(),
  atendido boolean not null default false
);
alter table share_solicitudes enable row level security;
drop policy if exists share_sol_insert on share_solicitudes;
create policy share_sol_insert on share_solicitudes for insert to anon, authenticated with check (true);
drop policy if exists share_sol_read on share_solicitudes;
create policy share_sol_read on share_solicitudes for select to authenticated
  using (exists (select 1 from user_profiles up where up.id = auth.uid()));
drop policy if exists share_sol_update on share_solicitudes;
create policy share_sol_update on share_solicitudes for update to authenticated
  using (exists (select 1 from user_profiles up where up.id = auth.uid())) with check (true);

-- El invitado puede dejar registro de versiones (historial recuperable por el admin)
drop policy if exists documento_versiones_insert_auth on documento_versiones;
create policy documento_versiones_insert_auth on documento_versiones for insert to authenticated with check (true);
