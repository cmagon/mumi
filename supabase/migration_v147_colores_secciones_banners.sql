-- v147 — Colores por sección (aviso, barra, footer) + colores por banner
alter table config_catalogo
  add column if not exists aviso_color_bg text,
  add column if not exists aviso_color_texto text,
  add column if not exists barra_color_bg text,
  add column if not exists barra_color_texto text,
  add column if not exists footer_color_bg text,
  add column if not exists footer_color_texto text;

alter table banners_catalogo
  add column if not exists color_fondo text,
  add column if not exists color_texto text,
  add column if not exists color_boton text;
