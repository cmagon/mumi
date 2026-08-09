-- v154 — Packs / presentaciones en tarjeta (grupo + etiqueta)
-- Varios productos del mismo grupo aparecen como chips (x6, x12…) en una sola tarjeta.

alter table finished_products
  add column if not exists catalogo_grupo text,
  add column if not exists catalogo_pack_label text,
  add column if not exists catalogo_pack_orden integer default 0;

comment on column finished_products.catalogo_grupo is
  'Clave compartida entre presentaciones del mismo producto (ej. infusion-cocona). Vacío = sin packs.';
comment on column finished_products.catalogo_pack_label is
  'Etiqueta del chip en la tarjeta (ej. x6, x12, 75 g, Caja).';
comment on column finished_products.catalogo_pack_orden is
  'Orden del chip dentro del grupo (menor = primero).';

drop view if exists catalogo_productos;
create view catalogo_productos as
  select
    fp.id,
    fp.nombre,
    coalesce(nullif(fp.catalogo_descripcion, ''), fp.descripcion, '') as descripcion,
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
