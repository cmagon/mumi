-- v98 — Catálogo v2: categoría automática (desde la ficha), frutos múltiples.

-- 1) Frutos MÚLTIPLES (antes era uno solo). Migra el valor único existente al array.
alter table finished_products add column if not exists catalogo_frutos text[];
update finished_products
  set catalogo_frutos = array[catalogo_fruto]
  where catalogo_fruto is not null and (catalogo_frutos is null or catalogo_frutos = '{}');

-- 2) Vista pública v2: la CATEGORÍA se toma automáticamente del tipo de la ficha del producto
--    (products_costing.tipo). Descripción e imágenes vienen del producto terminado (editable en su ficha).
-- Se borra primero porque cambian las columnas (create or replace no permite quitar columnas).
drop view if exists catalogo_productos;
create view catalogo_productos as
  select
    fp.id,
    fp.nombre,
    coalesce(fp.descripcion, '')                          as descripcion,
    fp.precio_detal,
    fp.precio_mayor,
    fp.imagen_url,
    coalesce(fp.imagenes, '[]'::jsonb)                    as imagenes,
    coalesce(pc.tipo, 'otros')                            as categoria,     -- automática desde la ficha
    coalesce(fp.catalogo_frutos, '{}')                    as frutos,
    coalesce(fp.catalogo_beneficios, '{}')                as beneficios,
    fp.catalogo_destacado                                 as destacado,
    coalesce(fp.stock, 0)                                 as stock
  from finished_products fp
  left join products_costing pc on pc.id = fp.product_id
  where fp.catalogo_visible = true and coalesce(fp.activo, true) = true;

grant select on catalogo_productos to anon;
