-- v112 — Mostrar (o no) el filtro por frutos en el catálogo.
alter table config_catalogo add column if not exists mostrar_filtro_frutos boolean default false;
