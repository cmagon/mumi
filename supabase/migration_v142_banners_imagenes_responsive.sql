-- v142 — Banners con versiones web / tablet / móvil
alter table banners_catalogo add column if not exists imagen_tablet text;
alter table banners_catalogo add column if not exists imagen_mobile text;
