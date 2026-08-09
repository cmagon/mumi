-- v141 — Portada / impacto configurables para plantilla web Atelier
alter table config_catalogo add column if not exists hero_cta_texto text default 'Explorar catálogo';
alter table config_catalogo add column if not exists hero_cta_link text default '/tienda';
alter table config_catalogo add column if not exists hero_cta2_texto text default 'Nuestra historia';
alter table config_catalogo add column if not exists hero_mostrar_cta2 boolean default true;
alter table config_catalogo add column if not exists hero_imagen text default '';

alter table config_catalogo add column if not exists impacto_activo boolean default true;
alter table config_catalogo add column if not exists impacto_titulo text default 'Impacto que florece';
alter table config_catalogo add column if not exists impacto_texto text default 'Cada producto apoya a comunidades recolectoras de la Amazonía colombiana: comercio justo y conservación de la biodiversidad.';
alter table config_catalogo add column if not exists impacto_stat1_n text default '45+';
alter table config_catalogo add column if not exists impacto_stat1_l text default 'Productores';
alter table config_catalogo add column if not exists impacto_stat2_n text default '10';
alter table config_catalogo add column if not exists impacto_stat2_l text default 'Departamentos';
alter table config_catalogo add column if not exists impacto_imagen text default '';
alter table config_catalogo add column if not exists impacto_link_texto text default 'Conoce más';

alter table config_catalogo add column if not exists cosecha_eyebrow text default 'Productos destacados';
alter table config_catalogo add column if not exists cosecha_titulo text default 'Nuestra cosecha';
alter table config_catalogo add column if not exists frutos_filtro_titulo text default 'Explora por ingrediente';
