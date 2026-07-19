-- v116 — Páginas personalizables (incluye galería/álbumes), botones y mapa en Contacto.

-- Mapa de la página Contacto (src del iframe de Google Maps)
alter table config_catalogo add column if not exists contacto_mapa text;

-- Páginas personalizadas creadas por el usuario. Cada una:
--   { id, titulo, slug, oculta(bool), bloques: [ ... ] }
-- Los bloques pueden ser: titulo, parrafo, imagen, boton, galeria (álbum), video.
alter table config_catalogo add column if not exists paginas jsonb default '[]'::jsonb;
