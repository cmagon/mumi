-- v115 — Fuentes del catálogo (Google Fonts) para títulos, subtítulos y párrafos.
alter table config_catalogo add column if not exists fuente_titulos text;
alter table config_catalogo add column if not exists fuente_subtitulos text;
alter table config_catalogo add column if not exists fuente_texto text;
