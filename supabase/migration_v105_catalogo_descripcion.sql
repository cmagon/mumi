-- v105 — La descripción del CATÁLOGO es independiente de la descripción técnica de la ficha.
--        Guarda HTML enriquecido (títulos, listas, negritas, etc.). Sin límite.
alter table finished_products add column if not exists catalogo_descripcion text;

-- La vista expone la descripción del catálogo (si existe); si no, cae a la técnica.
drop view if exists catalogo_productos;
create view catalogo_productos as
  select
    fp.id,
    fp.nombre,
    coalesce(nullif(fp.catalogo_descripcion, ''), fp.descripcion, '') as descripcion,
    fp.precio_detal,
    fp.precio_mayor,
    fp.imagen_url,
    coalesce(fp.imagenes, '[]'::jsonb)                                as imagenes,
    coalesce(nullif(fp.categoria_alegra_nombre, ''), pc.tipo, 'otros') as categoria,
    coalesce(fp.catalogo_frutos, '{}')                               as frutos,
    coalesce(fp.catalogo_beneficios, '{}')                           as beneficios,
    fp.catalogo_destacado                                            as destacado,
    coalesce(fp.catalogo_novedad, false)                             as novedad,
    coalesce(fp.stock, 0)                                            as stock,
    fp.created_at
  from finished_products fp
  left join products_costing pc on pc.id = fp.product_id
  where fp.catalogo_visible = true and coalesce(fp.activo, true) = true;

grant select on catalogo_productos to anon;
