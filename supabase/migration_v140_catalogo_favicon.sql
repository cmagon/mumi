-- v140 — Favicon del catálogo (configurable en Personalizar; vacío por defecto)
alter table config_catalogo add column if not exists favicon_url text default '';
