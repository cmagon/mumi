-- v96 — URL pública del catálogo (editable desde el admin). Para el botón "Ver catálogo".
alter table config_catalogo add column if not exists url_publica text;
