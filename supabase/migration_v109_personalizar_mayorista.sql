-- v109 — Personalización visual del catálogo + marca configurable + modo mayorista.
-- (Idempotente: usa "add column if not exists". Reemplaza al antiguo v107_catalogo_marca.)

-- ---- Marca ----
alter table config_catalogo add column if not exists logo_url text;
alter table config_catalogo add column if not exists nombre_tienda text;
alter table config_catalogo add column if not exists slogan text;

-- Texto editable de la página "Nosotros" (HTML enriquecido)
alter table config_catalogo add column if not exists nosotros_texto text;

-- Secciones del home: visibilidad + orden. Ej: [{"id":"hero","on":true}, ...]
alter table config_catalogo add column if not exists secciones jsonb default '[]'::jsonb;

-- Color de acento (además de color_primario que ya existe)
alter table config_catalogo add column if not exists color_secundario text;

-- ---- Modo mayorista ----
alter table config_catalogo add column if not exists mayorista_activo boolean default true;
alter table config_catalogo add column if not exists mayorista_clave text;
alter table config_catalogo add column if not exists mayorista_pedido_minimo integer default 0;
alter table config_catalogo add column if not exists mayorista_mensaje text;
alter table config_catalogo add column if not exists mayorista_wa_texto text;

-- Foto real del fruto (además del icono SVG)
alter table frutos_catalogo add column if not exists foto_url text;
