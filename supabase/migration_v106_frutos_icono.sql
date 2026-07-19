-- v106 — Los frutos usan un icono SVG (lucide) en vez de emoji. Se conserva 'emoji' como respaldo.
alter table frutos_catalogo add column if not exists icono text;
