-- v110 — Personalización avanzada: redes sociales, barra de beneficios, footer,
-- mensajes de WhatsApp configurables y bloques de la página "Nosotros".

-- Redes sociales (además de instagram_url que ya existe)
alter table config_catalogo add column if not exists facebook_url text;
alter table config_catalogo add column if not exists tiktok_url text;
alter table config_catalogo add column if not exists youtube_url text;
alter table config_catalogo add column if not exists x_url text;

-- Barra de beneficios (bajo la barra de mayorista) — totalmente configurable
alter table config_catalogo add column if not exists barra_activa boolean default true;
alter table config_catalogo add column if not exists barra_items jsonb default '["Envío nacional","100% natural","Compra segura","Pedido por WhatsApp"]'::jsonb;
alter table config_catalogo add column if not exists barra_color text;          -- fondo (vacío = usa color de plantilla)
alter table config_catalogo add column if not exists barra_texto_color text;    -- texto
alter table config_catalogo add column if not exists barra_tamano text default 'md';  -- sm | md | lg

-- Footer editable
alter table config_catalogo add column if not exists footer_texto text;
alter table config_catalogo add column if not exists footer_tamano text default 'md';

-- Mensajes de WhatsApp (parte editable; el resto se arma con producto + cantidades)
alter table config_catalogo add column if not exists wa_texto_stock text;
alter table config_catalogo add column if not exists wa_texto_sin_stock text;

-- Página "Nosotros": bloques (título, párrafo, imagen, mapa) + sección de frutos configurable
alter table config_catalogo add column if not exists nosotros_bloques jsonb default '[]'::jsonb;
alter table config_catalogo add column if not exists frutos_titulo text;
alter table config_catalogo add column if not exists frutos_subtitulo text;
