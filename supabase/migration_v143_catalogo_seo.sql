-- v143 — SEO del catálogo: keywords, verificación Google, control de indexación
alter table config_catalogo add column if not exists seo_keywords text;
alter table config_catalogo add column if not exists seo_verificacion text;
alter table config_catalogo add column if not exists seo_indexar boolean default true;

comment on column config_catalogo.seo_keywords is 'Palabras clave SEO (meta keywords + ayuda editorial)';
comment on column config_catalogo.seo_verificacion is 'Código google-site-verification (solo el content)';
comment on column config_catalogo.seo_indexar is 'Si false, robots.txt bloquea y meta robots=noindex';
