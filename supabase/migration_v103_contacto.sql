-- v103 — Mensajes del formulario de contacto del catálogo público.
create table if not exists mensajes_catalogo (
  id         bigserial primary key,
  nombre     text,
  email      text,
  telefono   text,
  mensaje    text not null,
  created_at timestamptz default now(),
  leido      boolean default false
);
alter table mensajes_catalogo enable row level security;
drop policy if exists mensajes_insert on mensajes_catalogo;
create policy mensajes_insert on mensajes_catalogo for insert to anon with check (true);
drop policy if exists mensajes_admin on mensajes_catalogo;
create policy mensajes_admin on mensajes_catalogo for all to authenticated using (true) with check (true);
