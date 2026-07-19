-- v120 — Banners principales (hero, arriba) vs banners secundarios (se colocan dentro del inicio).
alter table banners_catalogo add column if not exists es_secundario boolean default false;
