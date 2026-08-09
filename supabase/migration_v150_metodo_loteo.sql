-- v150 — Método de loteo por producto (ficha).
-- NOTA: hay otro archivo también llamado v150 (mayo_barra_colores). Si dudaste cuál corriste,
-- ejecuta también: migration_v155_metodo_loteo.sql (idempotente, misma columna).
alter table products_costing
  add column if not exists metodo_loteo jsonb;

comment on column products_costing.metodo_loteo is
  'Configuración de loteo del producto (secuencia+año, fecha, prefijo+seq, etc.). Si null, no se autosugiere lote.';
