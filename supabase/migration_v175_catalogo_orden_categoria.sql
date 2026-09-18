-- v175 — Orden del catálogo por categoría para el feed (hoja / Meta).
-- Agrega `catalogo_orden` por producto: número que decide qué va primero DENTRO de su
-- categoría (menor = primero). El feed se agrupa por categoría y, dentro de cada una,
-- ordena por este número y luego por nombre. Recrea la vista v164 + el campo `orden`.

alter table finished_products
  add column if not exists catalogo_orden int not null default 0;

drop view if exists catalogo_productos;
create view catalogo_productos as
  select
    fp.id,
    fp.nombre,
    coalesce(nullif(fp.catalogo_descripcion, ''), fp.descripcion, '') as descripcion,
    nullif(fp.catalogo_resumen, '')                                  as resumen,
    fp.precio_detal,
    fp.precio_mayor,
    fp.catalogo_precio_oferta                                        as precio_oferta,
    fp.catalogo_seo_titulo                                           as seo_titulo,
    fp.catalogo_seo_desc                                             as seo_desc,
    fp.catalogo_contenido                                            as contenido,
    fp.catalogo_origen                                               as origen,
    nullif(trim(fp.catalogo_grupo), '')                              as grupo,
    nullif(trim(fp.catalogo_pack_label), '')                         as pack_label,
    coalesce(fp.catalogo_pack_orden, 0)                              as pack_orden,
    coalesce(fp.catalogo_orden, 0)                                   as orden,
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
grant select on catalogo_productos to authenticated;
