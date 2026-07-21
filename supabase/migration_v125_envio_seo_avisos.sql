-- v125 — Envío, aviso superior, métodos de pago, SEO, mantenimiento y términos.

-- Envío: tarifa fija y mensaje personalizable (ficha {envio} en las plantillas de WhatsApp)
alter table config_catalogo add column if not exists envio_tarifa numeric;
alter table config_catalogo add column if not exists envio_mensaje text;

-- Aviso superior (hasta 3 mensajes cortos que rotan sobre el header)
alter table config_catalogo add column if not exists avisos jsonb default '[]'::jsonb;

-- Métodos de pago (solo se muestran en el carrito): [{ icono, nombre }]
alter table config_catalogo add column if not exists pagos jsonb default '[]'::jsonb;

-- SEO general del sitio (si está vacío se usa: nombre de la tienda + slogan)
alter table config_catalogo add column if not exists seo_titulo text;
alter table config_catalogo add column if not exists seo_descripcion text;
alter table config_catalogo add column if not exists seo_imagen text;

-- Modo mantenimiento
alter table config_catalogo add column if not exists mantenimiento_activo boolean default false;
alter table config_catalogo add column if not exists mantenimiento_mensaje text;

-- Términos y política de tratamiento de datos (se abre en un modal desde el footer)
alter table config_catalogo add column if not exists terminos_texto text;

-- SEO por producto (si está vacío se usa el nombre y la descripción del producto)
alter table finished_products add column if not exists catalogo_seo_titulo text;
alter table finished_products add column if not exists catalogo_seo_desc text;

-- Recrear la vista pública incluyendo el SEO del producto
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
