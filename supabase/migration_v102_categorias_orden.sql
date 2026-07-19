-- v102 — Orden de las categorías en el catálogo público (definido por el admin).
alter table config_catalogo add column if not exists categorias_orden text[] default '{}';
