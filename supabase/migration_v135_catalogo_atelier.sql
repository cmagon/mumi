-- v135 — Plantillas de diseño guardadas, ficha Atelier (Stitch) y specs de producto.

-- Plantillas visuales guardadas en Personalizar (payload: diseno, colores, fuentes, opciones de ficha)
alter table config_catalogo add column if not exists plantillas_guardadas jsonb default '[]'::jsonb;

-- Opciones de la ficha de producto
alter table config_catalogo add column if not exists ficha_cta_fijo boolean default true;
alter table config_catalogo add column if not exists ficha_mostrar_envio boolean default true;
alter table config_catalogo add column if not exists ficha_titulo_relacionados text default 'Combina bien con';
alter table config_catalogo add column if not exists mostrar_mayor boolean default false;

-- Specs opcionales por producto (grid Contenido / Origen del diseño Atelier)
alter table finished_products add column if not exists catalogo_contenido text;
alter table finished_products add column if not exists catalogo_origen text;

-- Vista pública con los nuevos campos
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

-- Semilla de plantillas de diseño (Clásico + Atelier) si aún no hay ninguna guardada
update config_catalogo
set plantillas_guardadas = '[
  {
    "id": "clasico",
    "nombre": "Clásico Mumi",
    "desc": "Diseño Selva actual: redondeado suave y tipografía Playfair",
    "payload": {
      "diseno": "selva",
      "plantilla": "amazonia",
      "color_primario": "#1a3a2a",
      "color_secundario": "#C8A94A",
      "fuente_titulos": "Playfair Display",
      "fuente_subtitulos": "Source Sans 3",
      "fuente_texto": "Source Sans 3",
      "ficha_cta_fijo": false,
      "ficha_mostrar_envio": true,
      "ficha_titulo_relacionados": "También te puede gustar"
    }
  },
  {
    "id": "atelier",
    "nombre": "Atelier Amazonía",
    "desc": "Nuevo diseño Stitch: ficha detalle con CTA fijo y tipografía Libre Caslon",
    "payload": {
      "diseno": "atelier",
      "plantilla": "amazonia",
      "color_primario": "#1A3A2A",
      "color_secundario": "#CFB360",
      "fuente_titulos": "Libre Caslon Text",
      "fuente_subtitulos": "Source Sans 3",
      "fuente_texto": "Source Sans 3",
      "ficha_cta_fijo": true,
      "ficha_mostrar_envio": true,
      "ficha_titulo_relacionados": "Combina bien con"
    }
  }
]'::jsonb
where id = 1
  and (plantillas_guardadas is null or plantillas_guardadas = '[]'::jsonb);
