-- v122 — Banners secundarios agrupados: varias imágenes de un mismo grupo forman un slide.
alter table banners_catalogo add column if not exists grupo text;
