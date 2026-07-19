-- v118 — Precios de oferta para productos existentes + productos/combos adicionales.

-- Oferta para productos que vienen de Productos Terminados
alter table finished_products add column if not exists catalogo_precio_oferta numeric;

-- Productos y combos creados desde el catálogo (no están en Productos Terminados)
--   { id, nombre, descripcion, categoria, imagenes:[], precio_detal, precio_oferta,
--     precio_mayor, stock, tipo:'producto'|'combo', componentes:[{id, cantidad}],
--     frutos:[], beneficios:[], destacado, novedad, visible }
alter table config_catalogo add column if not exists productos_extra jsonb default '[]'::jsonb;

-- Recrear la vista pública incluyendo el precio de oferta
drop view if exists catalogo_productos;
create view catalogo_productos as
  select
    fp.id,
    fp.nombre,
    coalesce(nullif(fp.catalogo_descripcion, ''), fp.descripcion, '') as descripcion,
    fp.precio_detal,
    fp.precio_mayor,
    fp.catalogo_precio_oferta                                        as precio_oferta,
    fp.imagen_url,
    coalesce(fp.imagenes, '[]'::jsonb)                               as imagenes,
    coalesce(nullif(fp.categoria_alegra_nombre, ''), pc.tipo, 'otros') as categoria,
    coalesce(fp.catalogo_frutos, '{}')                              as frutos,
    coalesce(fp.catalogo_beneficios, '{}')                          as beneficios,
    fp.catalogo_destacado                                           as destacado,
    coalesce(fp.catalogo_novedad, false)                            as novedad,
    coalesce(fp.stock, 0)                                           as stock,
    fp.created_at
  from finished_products fp
  left join products_costing pc on pc.id = fp.product_id
  where fp.catalogo_visible = true and coalesce(fp.activo, true) = true;

grant select on catalogo_productos to anon;
