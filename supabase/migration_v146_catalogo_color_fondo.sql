-- v146 — Fondo de página (3.er rol útil de color; no triada decorativa)
alter table config_catalogo
  add column if not exists color_fondo text default '#F5F0E8';
