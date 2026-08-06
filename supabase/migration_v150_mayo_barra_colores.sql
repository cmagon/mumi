-- v150 — Colores y tipografía de la barra de zona mayorista
alter table config_catalogo
  add column if not exists mayo_invita_color_bg text,
  add column if not exists mayo_invita_color_texto text,
  add column if not exists mayo_invita_color_btn text,
  add column if not exists mayo_invita_color_btn_texto text,
  add column if not exists mayo_invita_tamano text default 'md',
  add column if not exists mayo_banner_color_bg text,
  add column if not exists mayo_banner_color_texto text,
  add column if not exists mayo_banner_color_acento text;
