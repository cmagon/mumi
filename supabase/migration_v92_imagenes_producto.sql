-- v92 — Galería de imágenes por producto (varias imágenes, no solo una).
-- imagen_url se mantiene como la imagen PRINCIPAL (la primera de la galería) por compatibilidad.
-- Pensado para enlazar próximamente con APIs de otros servicios (catálogos, e-commerce, etc.).
alter table products_costing add column if not exists imagenes jsonb default '[]'::jsonb;
alter table finished_products add column if not exists imagenes jsonb default '[]'::jsonb;
