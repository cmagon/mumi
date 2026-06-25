-- v68: campos extra para Alegra en producto terminado: unidad de medida, código UNSPSC, categoría.
alter table finished_products add column if not exists unidad_medida text not null default 'unit';
alter table finished_products add column if not exists codigo_unspsc text;
alter table finished_products add column if not exists categoria_alegra_id text;
alter table finished_products add column if not exists categoria_alegra_nombre text;
