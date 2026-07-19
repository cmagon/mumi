-- v104 — Banners del slider (imagen o YouTube) + popup de bienvenida + redes.

-- 1) Banners configurables
create table if not exists banners_catalogo (
  id          bigserial primary key,
  tipo        text default 'imagen',      -- 'imagen' | 'youtube'
  imagen_url  text,
  youtube     text,                        -- URL o ID de YouTube
  titulo      text,
  subtitulo   text,
  boton_texto text,
  boton_link  text,                        -- ruta interna (/producto/ID, /tienda) o URL
  orden       integer default 0,
  activo      boolean default true,
  created_at  timestamptz default now()
);
alter table banners_catalogo enable row level security;
drop policy if exists banners_read on banners_catalogo;
create policy banners_read on banners_catalogo for select to anon using (activo = true);
drop policy if exists banners_admin on banners_catalogo;
create policy banners_admin on banners_catalogo for all to authenticated using (true) with check (true);

-- 2) Popup de bienvenida + redes en la configuración
alter table config_catalogo add column if not exists popup_activo   boolean default false;
alter table config_catalogo add column if not exists popup_titulo   text default '¡Bienvenido a Mumi! 🌿';
alter table config_catalogo add column if not exists popup_texto    text default 'Suscríbete y recibe un 10% en tu primer pedido.';
alter table config_catalogo add column if not exists instagram_url  text default 'https://instagram.com';
