-- v180 — Estilo de Hero por banner (diseño Selva).
-- Antes el estilo del carrusel principal era global (config_catalogo.hero_estilo).
-- Ahora cada banner principal puede elegir su propio estilo al crearlo/editarlo.
-- Valores: 'clasico' (texto abajo), 'centrado' (imagen completa + texto centrado),
-- 'split' (imagen a un lado y texto en bloque de color).

alter table banners_catalogo
  add column if not exists hero_estilo text not null default 'clasico';
