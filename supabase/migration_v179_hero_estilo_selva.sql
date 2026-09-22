-- v179 — Estilo del banner principal (hero) para el diseño Selva.
-- Valores: 'clasico' (texto abajo), 'centrado' (imagen completa + texto centrado),
-- 'split' (imagen a un lado y texto en bloque de color). Se guarda en config_catalogo,
-- que persiste el objeto de configuración completo (upsert { ...cfg }).

alter table config_catalogo
  add column if not exists hero_estilo text not null default 'clasico';
