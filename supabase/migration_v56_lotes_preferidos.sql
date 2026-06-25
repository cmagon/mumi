-- v56: lote de MP elegido por el usuario al crear la orden de producción
-- Estructura: { "<mp_id>": "<lote_id>", ... }. Vacío/null = PEPS automático.
alter table production_orders add column if not exists lotes_preferidos jsonb;
