-- v113 — El usuario decide si el slogan se muestra en el catálogo.
alter table config_catalogo add column if not exists mostrar_slogan boolean default true;
