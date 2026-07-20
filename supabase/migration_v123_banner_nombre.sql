-- v123 — Nombre interno del banner (solo para identificarlo en el panel; no se muestra en el catálogo).
alter table banners_catalogo add column if not exists nombre text;
