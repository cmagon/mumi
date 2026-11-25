-- v182 — Catálogos múltiples (colecciones de productos) para el catálogo público.
-- Un "catálogo" es una selección de productos y/o categorías ya existentes.
-- Se guardan en config_catalogo (que persiste el objeto de configuración completo con
-- upsert { ...cfg, id: 1 }), por eso cada clave debe existir como columna.
--
--  colecciones     : lista de catálogos. Cada uno:
--                    { id: string, nombre: string, items: [{ tipo:'producto'|'categoria', ref:string }] }
--  coleccion_activa: id de la colección que se muestra en la web pública.
--                    NULL / '' = catálogo "Normal" (se muestran todos los productos).

alter table config_catalogo
  add column if not exists colecciones jsonb not null default '[]'::jsonb;

alter table config_catalogo
  add column if not exists coleccion_activa text;
