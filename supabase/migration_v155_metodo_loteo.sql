-- v155 — Método de loteo por producto (ficha).
-- Idempotente: si ya corriste v150_metodo_loteo.sql, no cambia nada.
-- Sin esta columna, la UI puede mostrar el método en pantalla pero NO queda en SQL
-- y las órdenes no pueden leer la serie nAA (sugieren fecha u otras plantillas viejas).

alter table products_costing
  add column if not exists metodo_loteo jsonb;

comment on column products_costing.metodo_loteo is
  'Configuración de loteo del producto (Numeración+año, fecha ddmmaa, etc.). null = no autosugerir.';
