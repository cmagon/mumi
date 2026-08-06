-- v150 — Método de loteo por producto (ficha).
-- JSONB con preset/config: { metodo, prefijo, ancho_seq, formato_anio, reinicio, separador }.
-- null / vacío / metodo "ninguno" = no autosugerir lote al diligenciar órdenes.
alter table products_costing
  add column if not exists metodo_loteo jsonb;

comment on column products_costing.metodo_loteo is
  'Configuración de loteo del producto (secuencia+año, fecha, prefijo+seq, etc.). Si null, no se autosugiere lote.';
