-- v100 — La categoría del catálogo se toma de la categoría de Alegra del producto terminado
--        (categoria_alegra_nombre). Si no tiene, cae al tipo de la ficha.
drop view if exists catalogo_productos;
create view catalogo_productos as
  select
    fp.id,
    fp.nombre,
    coalesce(fp.descripcion, '')                              as descripcion,
    fp.precio_detal,
    fp.precio_mayor,
    fp.imagen_url,
    coalesce(fp.imagenes, '[]'::jsonb)                        as imagenes,
    coalesce(nullif(fp.categoria_alegra_nombre, ''), pc.tipo, 'otros') as categoria,
    coalesce(fp.catalogo_frutos, '{}')                        as frutos,
    coalesce(fp.catalogo_beneficios, '{}')                    as beneficios,
    fp.catalogo_destacado                                     as destacado,
    coalesce(fp.catalogo_novedad, false)                      as novedad,
    coalesce(fp.stock, 0)                                     as stock,
    fp.created_at
  from finished_products fp
  left join products_costing pc on pc.id = fp.product_id
  where fp.catalogo_visible = true and coalesce(fp.activo, true) = true;

grant select on catalogo_productos to anon;
