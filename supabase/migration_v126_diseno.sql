-- v126 — Estilo de diseño del catálogo (formas, bordes, sombras, botones), aparte del color.
alter table config_catalogo add column if not exists diseno text default 'selva';
