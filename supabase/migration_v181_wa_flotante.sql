-- v181 — Botón flotante de WhatsApp (catálogo público).
-- Se guardan en config_catalogo, que persiste el objeto de configuración completo
-- (upsert { ...cfg }), por eso cada clave debe existir como columna.

alter table config_catalogo
  add column if not exists wa_flotante_activo boolean not null default true;

alter table config_catalogo
  add column if not exists wa_flotante_mensaje text not null default '';
