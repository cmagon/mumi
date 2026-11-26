-- v183 — Borrador de personalización (flujo "guardar borrador → publicar").
-- La web pública sigue leyendo las columnas "en vivo" de config_catalogo (id=1).
-- Los cambios de Personalizar se guardan en `borrador` (jsonb) y NO afectan la web
-- hasta que el usuario pulse "Publicar", momento en que el borrador pasa a las columnas.
--
--  borrador = NULL  → no hay cambios sin publicar (lo que se ve en vivo = columnas)
--  borrador = {...} → copia completa de la configuración en edición, pendiente de publicar

alter table config_catalogo
  add column if not exists borrador jsonb;
