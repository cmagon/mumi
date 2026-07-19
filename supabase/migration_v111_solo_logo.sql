-- v111 — Opción de mostrar solo el logo (ocultar nombre/slogan en pantallas pequeñas).
alter table config_catalogo add column if not exists solo_logo boolean default false;
