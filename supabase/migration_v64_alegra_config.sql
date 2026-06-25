-- v64: configuración de Alegra desde la app (correo + token de API). Solo admin.
create table if not exists alegra_config (
  id int primary key default 1,
  email text,
  token text,
  updated_at timestamptz not null default now(),
  constraint alegra_config_single check (id = 1)
);
alter table alegra_config enable row level security;
-- Solo administradores pueden ver/editar (el token es sensible). Las Edge Functions usan service role.
drop policy if exists alegra_config_admin on alegra_config;
create policy alegra_config_admin on alegra_config for all to authenticated
  using (exists (select 1 from user_profiles up where up.id = auth.uid() and up.rol = 'admin'))
  with check (exists (select 1 from user_profiles up where up.id = auth.uid() and up.rol = 'admin'));

insert into alegra_config (id) values (1) on conflict (id) do nothing;
