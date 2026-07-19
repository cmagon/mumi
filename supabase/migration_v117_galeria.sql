-- v117 — Galería tipo Pinterest (álbumes de imágenes y videos), separada de las páginas.
-- Cada álbum: { id, titulo, subtitulo, tamano('sm'|'md'|'lg'), items:[{tipo:'imagen'|'video', url}] }
alter table config_catalogo add column if not exists galeria_albumes jsonb default '[]'::jsonb;
alter table config_catalogo add column if not exists galeria_titulo text;
alter table config_catalogo add column if not exists galeria_subtitulo text;
